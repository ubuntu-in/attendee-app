<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import QRCode from 'qrcode';
  import jsQR from 'jsqr';

  export let eventId: string;

  // ── Ticket state ─────────────────────────────────────────────────────────────
  let localTicket: any = null;
  let pendingTicket: any = null;
  let showConfirmModal = false;
  let qrCodeDataUrl: string | null = null;
  let isFetching = false;
  let errorMsg: string | null = null;

  // ── Confirmation-modal focus management ──────────────────────────────────────
  let modalDialogEl: HTMLDivElement | null = null;
  let previouslyFocusedEl: HTMLElement | null = null;

  // ── Scanner state ────────────────────────────────────────────────────────────
  let showScanner = false;
  let scannerMsg: string | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let fileInputEl: HTMLInputElement | null = null;
  let stream: MediaStream | null = null;
  let scanLoopId: number | null = null;
  let lastDetectedPayload: string | null = null;
  let barcodeDetector: any = null;

  // ── Scanner overlay focus management ─────────────────────────────────────────
  let scannerOverlayEl: HTMLDivElement | null = null;
  let scannerPreviouslyFocusedEl: HTMLElement | null = null;

  /**
   * Session token: incremented every time the scanner is opened so that
   * stale `BarcodeDetector.detect()` / jsQR callbacks that fire after the
   * scanner has been closed belong to an old session and are silently dropped.
   */
  let scanSessionId = 0;

  /** AbortController for the in-flight KonfHub API request. */
  let fetchAbortController: AbortController | null = null;

  /** Max upload file size: 10 MB */
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  /** Max upload image dimension (width or height): 8192 px */
  const MAX_IMAGE_DIM = 8192;

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const bookingIdFromUrl = urlParams.get('bookingid');

    const storedTicket = localStorage.getItem('ubucon_ticket');
    if (storedTicket) {
      try {
        localTicket = JSON.parse(storedTicket);
      } catch (e) {
        localStorage.removeItem('ubucon_ticket');
      }
    }

    if (bookingIdFromUrl) {
      if (localTicket) {
        await generateQR(localTicket);
      }
      await fetchTicketForConfirmation(bookingIdFromUrl);
    } else if (localTicket) {
      await generateQR(localTicket);
    }
  });

  onDestroy(() => {
    stopScanner();
    fetchAbortController?.abort();
  });

  // ── API ───────────────────────────────────────────────────────────────────────
  async function fetchTicketForConfirmation(bookingId: string) {
    // Cancel any in-flight request before starting a new one.
    fetchAbortController?.abort();
    fetchAbortController = new AbortController();

    isFetching = true;
    errorMsg = null;
    try {
      const res = await fetch(
        `https://api.konfhub.com/integration/validate?validateBy=${encodeURIComponent(bookingId)}&eventId=${eventId}`,
        { signal: AbortSignal.any([fetchAbortController.signal, AbortSignal.timeout(15_000)]) }
      );
      if (!res.ok) throw new Error('Failed to validate ticket');
      const data = await res.json();

      if (!data?.name || typeof data.name !== 'string' || data.name.trim() === '') {
        throw new Error('Invalid ticket data received from server.');
      }

      pendingTicket = { ...data, bookingId };
      await openConfirmModal();
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // intentional cancel – do nothing
      if (e?.name === 'TimeoutError') {
        errorMsg = 'Request timed out. Please check your connection and try again.';
      } else {
        errorMsg = e?.message ?? 'Could not fetch ticket details. Please ensure the link is valid.';
      }
    } finally {
      isFetching = false;
      fetchAbortController = null;
      cleanUrl();
    }
  }

  function cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('bookingid');
    window.history.replaceState({}, '', url);
  }

  // ── Confirm-modal actions ─────────────────────────────────────────────────────
  async function confirmSaveTicket() {
    if (!pendingTicket) return;
    localStorage.setItem('ubucon_ticket', JSON.stringify(pendingTicket));
    localTicket = pendingTicket;
    pendingTicket = null;
    showConfirmModal = false;
    restoreConfirmFocus();
    cleanUrl();
    await generateQR(localTicket);
  }

  function cancelConfirm() {
    pendingTicket = null;
    showConfirmModal = false;
    cleanUrl();
    restoreConfirmFocus();
    if (localTicket) {
      generateQR(localTicket);
    }
  }

  async function openConfirmModal() {
    previouslyFocusedEl = document.activeElement as HTMLElement | null;
    cleanUrl();
    showConfirmModal = true;
    await tick();
    const firstBtn = modalDialogEl?.querySelector('button') as HTMLElement | null;
    firstBtn?.focus();
  }

  function restoreConfirmFocus() {
    previouslyFocusedEl?.focus();
    previouslyFocusedEl = null;
  }

  // ── Scanner open / close ──────────────────────────────────────────────────────
  async function openScanner() {
    errorMsg = null;
    scannerMsg = null;
    lastDetectedPayload = null;
    scanSessionId += 1;         // invalidate any stale rAF / detect() callbacks
    showScanner = true;
    scannerPreviouslyFocusedEl = document.activeElement as HTMLElement | null;
    await tick();
    // Move focus to the first focusable element inside the overlay.
    const firstFocusable = scannerOverlayEl?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
    await startCamera();
  }

  function closeScanner() {
    showScanner = false;
    stopScanner();
    scannerPreviouslyFocusedEl?.focus();
    scannerPreviouslyFocusedEl = null;
  }

  // ── Camera / scan-loop ────────────────────────────────────────────────────────
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      scannerMsg = 'Camera API not supported in this browser. Use the upload option below.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (!videoEl) {
        stopScanner();
        return;
      }
      videoEl.srcObject = stream;
      await videoEl.play();

      // Prefer the native BarcodeDetector; only fall back to jsQR when absent.
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        } catch {
          barcodeDetector = null;
        }
      } else {
        barcodeDetector = null;
      }

      scanFrame(scanSessionId);
    } catch (err: any) {
      stopScanner();
      const name = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        scannerMsg = 'Camera access was denied. Enable camera permission in your browser settings, or use the Upload Image option below.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        scannerMsg = 'No camera found on this device. Use the Upload Image option below.';
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        scannerMsg = 'Camera is in use by another app. Close it and try again.';
      } else {
        scannerMsg = `Could not start camera: ${err?.message ?? 'Unknown error'}. Use the Upload Image option below.`;
      }
    }
  }

  function stopScanner() {
    if (scanLoopId !== null) {
      cancelAnimationFrame(scanLoopId);
      scanLoopId = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
    barcodeDetector = null;
  }

  /**
   * Scan loop.  Every call carries the `sessionId` at the time the scanner
   * was opened.  If `scanSessionId` has moved on (scanner closed and re-opened,
   * or just closed), stale callbacks are silently dropped.
   */
  async function scanFrame(sessionId: number) {
    // Guard: drop stale callbacks from a previous scanner session.
    if (sessionId !== scanSessionId || !showScanner) return;
    if (!videoEl || !canvasEl) return;

    if (videoEl.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      scanLoopId = requestAnimationFrame(() => scanFrame(sessionId));
      return;
    }

    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (w === 0 || h === 0) {
      scanLoopId = requestAnimationFrame(() => scanFrame(sessionId));
      return;
    }

    // ── Try native BarcodeDetector first ──────────────────────────────────────
    if (barcodeDetector) {
      try {
        const barcodes = await barcodeDetector.detect(videoEl);
        // Re-check session after the async detect() call.
        if (sessionId !== scanSessionId || !showScanner) return;
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          const payload = barcodes[0].rawValue;
          if (payload !== lastDetectedPayload) {
            lastDetectedPayload = payload;
            handleQRDetected(payload, sessionId);
            return;
          }
          // QR found but already processed; keep looping.
          scanLoopId = requestAnimationFrame(() => scanFrame(sessionId));
          return;
        }
        // No barcode detected by native detector — keep looping without jsQR.
        scanLoopId = requestAnimationFrame(() => scanFrame(sessionId));
        return;
      } catch {
        // Native detector threw — fall through to jsQR as a one-time fallback,
        // and clear barcodeDetector so we don't retry the failing native path.
        barcodeDetector = null;
      }
    }

    // ── jsQR fallback (only when BarcodeDetector is absent or threw) ──────────
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext('2d')!;
    ctx.drawImage(videoEl, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data && code.data !== lastDetectedPayload) {
      lastDetectedPayload = code.data;
      handleQRDetected(code.data, sessionId);
      return;
    }

    scanLoopId = requestAnimationFrame(() => scanFrame(sessionId));
  }

  async function handleQRDetected(raw: string, sessionId: number) {
    // Drop stale detections that arrived after the scanner was closed.
    if (sessionId !== scanSessionId || !showScanner) return;

    stopScanner();
    showScanner = false;
    scannerPreviouslyFocusedEl?.focus();
    scannerPreviouslyFocusedEl = null;

    const bookingId = parseBookingId(raw);
    if (!bookingId) {
      errorMsg = 'Invalid QR code. Please scan a valid UbuCon ticket QR code.';
      return;
    }

    const eidMatch = raw.match(/(?:^|[|])eid:([^|]+)/);
    if (eidMatch && eidMatch[1].trim() !== eventId) {
      errorMsg = 'This QR code is for a different event. Please scan your UbuCon India 2026 ticket.';
      return;
    }

    await fetchTicketForConfirmation(bookingId);
  }

  /**
   * Extract a KonfHub booking ID from a raw QR string.
   *
   * Priority order:
   * 1. Structured payload  `id:<bookingId>|n:<name>|eid:<eventId>`
   * 2. Raw booking ID fallback — accepted only when the string looks like a
   *    KonfHub ID (≤ 64 chars, alphanumeric / hyphens / underscores).
   *    This rejects URLs, Wi-Fi payloads, vCards, and unrelated QR content
   *    without making a wasted API call.
   */
  function parseBookingId(raw: string): string | null {
    const match = raw.match(/(?:^|[|])id:([^|]+)/);
    if (match) return match[1].trim() || null;
    const trimmed = raw.trim();
    // Guard: only forward bare strings that look like booking IDs.
    if (trimmed.length > 0 && trimmed.length <= 64 && /^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  // ── File upload ───────────────────────────────────────────────────────────────
  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    // Guard: file size limit.
    if (file.size > MAX_FILE_BYTES) {
      scannerMsg = 'Image file is too large (max 10 MB). Please choose a smaller image.';
      return;
    }

    let dataUrl: string;
    try {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = evt => resolve(evt.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });
    } catch {
      scannerMsg = 'Could not read the selected file. Please try a different image.';
      return;
    }

    const img = new Image();
    img.src = dataUrl;
    try {
      if (img.decode) {
        await img.decode();
      } else if (!img.complete || !img.naturalWidth) {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image failed to load.'));
        });
      }
    } catch {
      scannerMsg = 'The selected file is not a valid image. Please try a different file.';
      return;
    }

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    // Guard: dimension limit.
    if (imgW > MAX_IMAGE_DIM || imgH > MAX_IMAGE_DIM) {
      scannerMsg = `Image dimensions are too large (max ${MAX_IMAGE_DIM} px per side). Please crop or resize the image.`;
      return;
    }

    if (!imgW || !imgH) {
      scannerMsg = 'Could not determine image dimensions. Please try a different image.';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      scannerMsg = 'Could not process the image. Please try a different file.';
      return;
    }

    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data) {
      await handleQRDetected(code.data, scanSessionId);
    } else {
      scannerMsg = 'No QR code found in the selected image. Try a clearer photo or crop closer to the QR code.';
    }
  }

  // ── QR generation ─────────────────────────────────────────────────────────────
  async function generateQR(ticket: any) {
    const payload = `id:${ticket.bookingId}|n:${ticket.name}|eid:${eventId}`;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(payload, { width: 140, margin: 1, scale: 4 });
    } catch (err) {
      console.error('Failed to generate QR', err);
    }
  }

  // ── Keyboard handlers ─────────────────────────────────────────────────────────
  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showConfirmModal) {
        e.preventDefault();
        cancelConfirm();
      } else if (showScanner) {
        e.preventDefault();
        closeScanner();
      }
    }
  }

  /** Focus-trap for the confirmation modal. */
  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab' && modalDialogEl) {
      const focusable = Array.from(
        modalDialogEl.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /** Focus-trap for the scanner overlay — always intercepts Tab to keep focus inside. */
  function handleScannerKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab' && scannerOverlayEl) {
      const focusable = Array.from(
        scannerOverlayEl.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      );
      if (focusable.length === 0) return;
      // Always take over Tab navigation so focus can never escape the overlay.
      e.preventDefault();
      const current = document.activeElement as HTMLElement;
      const idx = focusable.indexOf(current);
      if (e.shiftKey) {
        // Shift+Tab: move backward, wrap from first → last.
        focusable[idx <= 0 ? focusable.length - 1 : idx - 1].focus();
      } else {
        // Tab: move forward, wrap from last → first.
        focusable[idx >= focusable.length - 1 ? 0 : idx + 1].focus();
      }
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if showScanner}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="qr-scanner-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Scan ticket QR code"
    bind:this={scannerOverlayEl}
    on:keydown={handleScannerKeydown}
  >
    <div class="qr-scanner-card">

      <div class="qr-scanner-header">
        <span class="qr-scanner-title">Scan Ticket QR Code</span>
        <button class="qr-close-btn" on:click={closeScanner} aria-label="Close scanner" type="button">
          <i class="p-icon--close"></i>
        </button>
      </div>

      {#if !scannerMsg}
        <div class="qr-viewfinder">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={videoEl} playsinline muted class="qr-video"></video>
          <canvas bind:this={canvasEl} class="qr-canvas-hidden" aria-hidden="true"></canvas>

          <div class="qr-vf-box" aria-hidden="true">
            <span class="qr-corner qr-corner--tl"></span>
            <span class="qr-corner qr-corner--tr"></span>
            <span class="qr-corner qr-corner--bl"></span>
            <span class="qr-corner qr-corner--br"></span>
            <span class="qr-scanline"></span>
          </div>

          <p class="qr-vf-hint">Point your camera at the ticket QR code</p>
        </div>
      {:else}
        <div class="qr-error-body">
          <div class="qr-error-icon" aria-hidden="true">
            <i class="p-icon--error"></i>
          </div>
          <p class="qr-error-text">{scannerMsg}</p>
        </div>
      {/if}

      <div class="qr-divider">
        <span>or upload an image</span>
      </div>

      <button class="p-button--positive qr-upload-btn" on:click={() => fileInputEl?.click()}>
        <i class="p-icon--plus"></i>
        Choose QR Image
      </button>
      <input type="file" accept="image/*" bind:this={fileInputEl}
             on:change={handleFileSelect} style="display:none"
             tabindex="-1" aria-hidden="true" />

      <p class="qr-upload-hint">Select a screenshot or photo of your ticket's QR code</p>
    </div>
  </div>
{/if}

<div class="ticket-manager" style="display: flex; flex-direction: column; align-items: center;">
  {#if errorMsg}
    <div class="p-notification--negative" style="width: 100%; max-width: 360px;">
      <div class="p-notification__content">
        <h5 class="p-notification__title">Error</h5>
        <p class="p-notification__message">{errorMsg}</p>
      </div>
    </div>
  {/if}

  {#if isFetching}
    <div class="u-align-text--center" style="margin: 2rem 0; height: 240px; display: flex; align-items: center; justify-content: center; flex-direction: column;">
      <i class="p-icon--spinner u-animation--spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Loading ticket details...</p>
    </div>
  {:else}
    <div style="position: relative; display: inline-block; margin-bottom: 2rem;">
      <svg width="180" height="240" viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#E95420" />
            <stop offset="100%" stop-color="#772953" />
          </linearGradient>
          
          <linearGradient id="glossGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
            <stop offset="49.9%" stop-color="#ffffff" stop-opacity="0.05"/>
            <stop offset="50%" stop-color="#ffffff" stop-opacity="0"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </linearGradient>

          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="15" stdDeviation="15" flood-color="#772953" flood-opacity="0.3" />
          </filter>
        </defs>

        <path d="M 45,0 L 105,0 Q 125,0 125,20 L 125,88 A 12,12 0 0 0 125,112 L 125,180 Q 125,200 105,200 L 45,200 Q 25,200 25,180 L 25,112 A 12,12 0 0 0 25,88 L 25,20 Q 25,0 45,0 Z" fill="url(#bgGrad)" filter="url(#shadow)" />
        <path d="M 45,0 L 105,0 Q 125,0 125,20 L 125,88 A 12,12 0 0 0 125,112 L 125,180 Q 125,200 105,200 L 45,200 Q 25,200 25,180 L 25,112 A 12,12 0 0 0 25,88 L 25,20 Q 25,0 45,0 Z" fill="url(#glossGrad)" />

        <rect x="52" y="130" width="46" height="46" rx="6" fill="#FFFFFF" />

        {#if localTicket && qrCodeDataUrl}
          <image href={qrCodeDataUrl} x="53" y="131" height="44" width="44" />
          <g opacity="0.9">
            <circle cx="75" cy="38" r="12" fill="#ffffff" fill-opacity="0.3" />
            <circle cx="75" cy="35" r="3.5" fill="#ffffff" fill-opacity="0.8" />
            <path d="M 68,45 Q 68,39 75,39 Q 82,39 82,45" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2" stroke-linecap="round" />
          </g>
          <text x="75" y="59" font-size="7" fill="#ffffff" font-family="Ubuntu, sans-serif" font-weight="bold" text-anchor="middle">{localTicket.name || 'Attendee'}</text>
          <text x="75" y="69" font-size="5.5" fill="#ffffff" font-family="Ubuntu, sans-serif" opacity="0.85" text-anchor="middle">{localTicket.ticketName || 'Attendee Pass'}</text>
        {:else}
          <rect x="58" y="136" width="34" height="34" rx="3" fill="#f4f4f4" />
          <g opacity="0.9">
            <circle cx="75" cy="38" r="12" fill="#ffffff" fill-opacity="0.3" />
            <circle cx="75" cy="35" r="3.5" fill="#ffffff" fill-opacity="0.8" />
            <path d="M 68,45 Q 68,39 75,39 Q 82,39 82,45" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2" stroke-linecap="round" />
          </g>
          <rect x="56" y="55" width="38" height="5" rx="2.5" fill="#ffffff" fill-opacity="0.9" />
          <rect x="63" y="65" width="24" height="4" rx="2" fill="#ffffff" fill-opacity="0.6" />
        {/if}

        <line x1="42" y1="100" x2="108" y2="100" stroke="#ffffff" stroke-width="3" stroke-dasharray="6,6" stroke-opacity="0.5" />
        
        <g transform="translate(105, -15)">
          <path d="M 5,0 L 25,0 Q 30,0 30,5 L 30,9 A 4,4 0 0 0 30,17 L 30,21 Q 30,26 25,26 L 5,26 Q 0,26 0,21 L 0,17 A 4,4 0 0 0 0,9 L 0,5 Q 0,0 5,0 Z" fill="#000" opacity="0.1" transform="translate(0, 5)" />
          <path d="M 5,0 L 25,0 Q 30,0 30,5 L 30,9 A 4,4 0 0 0 30,17 L 30,21 Q 30,26 25,26 L 5,26 Q 0,26 0,21 L 0,17 A 4,4 0 0 0 0,9 L 0,5 Q 0,0 5,0 Z" fill="#FFFFFF" stroke="#E95420" stroke-width="2.5" />
          <circle cx="15" cy="7" r="2.5" fill="#E95420" />
          <circle cx="15" cy="13" r="2.5" fill="#E95420" />
          <circle cx="15" cy="19" r="2.5" fill="#E95420" />
        </g>
      </svg>
    </div>

    {#if localTicket}
      <h2 class="p-heading--3 u-no-margin--bottom">{localTicket.name}</h2>
      <p class="p-heading--5 u-text--muted u-sv1">
        {localTicket.designation} {#if localTicket.organisation} @ {localTicket.organisation}{/if}
      </p>
      <button
        class="p-button--base"
        style="margin-top: 1rem; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;"
        on:click={openScanner}
        aria-label="Scan a different ticket QR code"
      >
        <i class="p-icon--plus"></i>
        Scan different ticket
      </button>
    {:else}
      <h2 class="p-heading--3 u-no-margin--bottom">No ticket added yet</h2>
      <p class="p-heading--5 u-text--muted u-sv1">
        Your digital pass will appear here<br>once you scan or upload it.
      </p>

      <button
        class="p-button--positive"
        id="scan-ticket-btn"
        style="width: 100%; max-width: 360px; margin-top: 1rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;"
        on:click={openScanner}
      >
        <i class="p-icon--plus" style="filter: brightness(0) invert(1);"></i>
        Scan or Upload Ticket
      </button>
    {/if}
  {/if}

  {#if showConfirmModal && pendingTicket}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="p-modal" id="modal" style="display: flex;" on:keydown={handleModalKeydown}>
      <div class="p-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" bind:this={modalDialogEl}>
        <header class="p-modal__header">
          <h2 class="p-modal__title" id="modal-title">
            {#if localTicket}
              Remove previous ticket?
            {:else}
              Is this correct?
            {/if}
          </h2>
        </header>
        <div class="p-modal__content" id="modal-description">
          {#if localTicket}
            <p style="margin-bottom: 0.75rem;">
              You already have a saved ticket for <strong>{localTicket.name}</strong>. Adding this new ticket will remove the previous ticket from this device.
            </p>
          {:else}
            <p style="margin-bottom: 0.75rem;">
              Please confirm your ticket details before saving to this device:
            </p>
          {/if}

          <div style="background: rgba(0, 0, 0, 0.05); padding: 0.85rem; border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.1); margin-top: 0.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <p style="margin: 0; font-weight: 600; font-size: 1rem; color: #111;">{pendingTicket.name}</p>
            <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: #111;">{pendingTicket.ticketName || 'Attendee Pass'}{#if pendingTicket.designation}{' • ' + pendingTicket.designation}{/if}{#if pendingTicket.organisation}{' @ ' + pendingTicket.organisation}{/if}</p>
          </div>
        </div>
        <footer class="p-modal__footer">
          <button class="p-button" on:click={cancelConfirm}>Cancel</button>
          <button class="p-button--positive" on:click={confirmSaveTicket}>
            {#if localTicket}
              Replace Ticket
            {:else}
              Add Ticket
            {/if}
          </button>
        </footer>
      </div>
    </div>
  {/if}
</div>

<style>
  .qr-scanner-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    backdrop-filter: blur(4px);
    animation: qr-overlay-in 0.18s ease;
  }

  @keyframes qr-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .qr-scanner-card {
    background: #1c1c1e;
    border-radius: 16px;
    width: 100%;
    max-width: 400px;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    animation: qr-card-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes qr-card-in {
    from { transform: scale(0.92) translateY(12px); opacity: 0; }
    to   { transform: scale(1)    translateY(0);     opacity: 1; }
  }

  .qr-scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .qr-scanner-title {
    color: #f5f5f5;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .qr-close-btn {
    background: rgba(255, 255, 255, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    flex-shrink: 0;
  }

  .qr-close-btn .p-icon--close {
    filter: brightness(0) invert(1);
    width: 16px;
    height: 16px;
    display: inline-block;
  }

  .qr-close-btn:hover,
  .qr-close-btn:focus-visible {
    background: #E95420;
    border-color: #E95420;
    color: #ffffff;
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }

  .qr-viewfinder {
    position: relative;
    background: #000;
    aspect-ratio: 1 / 1;
    overflow: hidden;
  }

  .qr-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .qr-canvas-hidden {
    display: none;
  }

  .qr-vf-box {
    position: absolute;
    inset: 14%;
    pointer-events: none;
  }

  .qr-corner {
    position: absolute;
    width: 22px;
    height: 22px;
    border-color: #E95420;
    border-style: solid;
    border-radius: 2px;
  }

  .qr-corner--tl { top: 0;    left: 0;    border-width: 3px 0 0 3px; }
  .qr-corner--tr { top: 0;    right: 0;   border-width: 3px 3px 0 0; }
  .qr-corner--bl { bottom: 0; left: 0;    border-width: 0 0 3px 3px; }
  .qr-corner--br { bottom: 0; right: 0;   border-width: 0 3px 3px 0; }

  .qr-scanline {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #E95420, transparent);
    top: 0;
    animation: qr-scan 2s ease-in-out infinite;
    box-shadow: 0 0 6px #E95420;
  }

  @keyframes qr-scan {
    0%   { top: 0%; opacity: 1; }
    80%  { top: 100%; opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }

  .qr-vf-hint {
    position: absolute;
    bottom: 0.65rem;
    left: 0;
    right: 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.78rem;
    margin: 0;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }

  .qr-error-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1.5rem;
    min-height: 180px;
    background: #111;
  }

  .qr-error-icon {
    opacity: 0.85;
  }

  .qr-error-text {
    color: #ccc;
    font-size: 0.85rem;
    text-align: center;
    line-height: 1.5;
    margin: 0;
    max-width: 280px;
  }

  .qr-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem 0;
    color: #555;
    font-size: 0.78rem;
  }

  .qr-divider::before,
  .qr-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  .qr-upload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 0.8rem auto;
    padding: 0.65rem 1.5rem;
    user-select: none;
  }

  .qr-upload-btn .p-icon--plus {
    filter: brightness(0) invert(1);
  }

  .qr-upload-hint {
    color: #666;
    font-size: 0.72rem;
    text-align: center;
    margin: 0 1.25rem 1rem;
    line-height: 1.4;
  }
</style>
