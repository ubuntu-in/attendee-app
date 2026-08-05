<script lang="ts">
  import { onMount, tick } from 'svelte';
  import QRCode from 'qrcode';

  export let eventId: string;
  export let hmacSecret: string;

  let localTicket: any = null;
  let showReplaceModal = false;
  let newBookingIdFromUrl: string | null = null;
  let qrCodeDataUrl: string | null = null;
  let isFetching = false;
  let errorMsg: string | null = null;
  let modalDialogEl: HTMLDivElement | null = null;
  let previouslyFocusedEl: HTMLElement | null = null;

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    newBookingIdFromUrl = urlParams.get('bookingid');

    const storedTicket = localStorage.getItem('ubucon_ticket');
    if (storedTicket) {
      try {
        localTicket = JSON.parse(storedTicket);
      } catch (e) {
        localStorage.removeItem('ubucon_ticket');
      }
    }

    if (newBookingIdFromUrl) {
      if (localTicket) {
        // Ask to replace if they already have one
        await generateQR(localTicket);
        await openModal();
      } else {
        // No existing ticket, just fetch and save
        await fetchAndSaveTicket(newBookingIdFromUrl);
      }
    } else if (localTicket) {
      // Just render the existing ticket
      await generateQR(localTicket);
    }
  });

  async function fetchAndSaveTicket(bookingId: string) {
    isFetching = true;
    errorMsg = null;
    try {
      const res = await fetch(
        `https://api.konfhub.com/integration/validate?validateBy=${bookingId}&eventId=${eventId}`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) throw new Error('Failed to validate ticket');
      const data = await res.json();
      
      // Store the booking ID alongside the fetched data
      const ticketToSave = { ...data, bookingId };
      
      localStorage.setItem('ubucon_ticket', JSON.stringify(ticketToSave));
      localTicket = ticketToSave;
      
      await generateQR(localTicket);
    } catch (e: any) {
      if (e?.name === 'TimeoutError') {
        errorMsg = 'Request timed out. Please check your connection and try again.';
      } else {
        errorMsg = 'Could not fetch ticket details. Please ensure the link is valid.';
      }
    } finally {
      isFetching = false;
      cleanUrl();
    }
  }

  function cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('bookingid');
    window.history.replaceState({}, '', url);
  }

  async function replaceTicket() {
    showReplaceModal = false;
    restoreFocus();
    if (newBookingIdFromUrl) {
      localStorage.removeItem('ubucon_ticket');
      await fetchAndSaveTicket(newBookingIdFromUrl);
    }
  }

  function cancelReplace() {
    showReplaceModal = false;
    cleanUrl();
    restoreFocus();
    if (localTicket) {
      generateQR(localTicket);
    }
  }

  // ── Modal Focus Management (a11y) ────────────────────────
  async function openModal() {
    previouslyFocusedEl = document.activeElement as HTMLElement | null;
    showReplaceModal = true;
    await tick();
    // Focus the first focusable element inside the dialog
    const firstBtn = modalDialogEl?.querySelector('button') as HTMLElement | null;
    firstBtn?.focus();
  }

  function restoreFocus() {
    previouslyFocusedEl?.focus();
    previouslyFocusedEl = null;
  }

  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelReplace();
      return;
    }
    // Focus trap: cycle Tab between the two modal buttons
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

  // ── HMAC-SHA256 Signing (anti-spoofing) ──────────────────
  async function computeHmac(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(hmacSecret);
    const key = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function generateQR(ticket: any) {
    // Format: id:<booking_id>|n:<name>|eventId:<event_id>|sig:<hmac_hex>
    const payload = `id:${ticket.bookingId}|n:${ticket.name}|eventId:${eventId}`;
    try {
      const sig = await computeHmac(payload);
      const qrString = `${payload}|sig:${sig}`;
      qrCodeDataUrl = await QRCode.toDataURL(qrString, { width: 140, margin: 1, scale: 4 });
    } catch (err) {
      console.error('Failed to generate QR', err);
    }
  }
</script>

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
    <!-- SVG Hero Graphic -->
    <div style="position: relative; display: inline-block; margin-bottom: 2rem;">
      <svg width="180" height="240" viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#E95420" /> <!-- Ubuntu Orange -->
            <stop offset="100%" stop-color="#772953" /> <!-- Aubergine -->
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
            <circle cx="50" cy="55" r="14" fill="#ffffff" fill-opacity="0.3" />
            <circle cx="50" cy="52" r="4" fill="#ffffff" fill-opacity="0.8" />
            <path d="M 42,63 Q 42,56 50,56 Q 58,56 58,63" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2.5" stroke-linecap="round" />
          </g>
          <text x="72" y="52" font-size="7" fill="#ffffff" font-family="Ubuntu, sans-serif" font-weight="bold">{localTicket.name || 'Attendee'}</text>
          <text x="72" y="62" font-size="5" fill="#ffffff" font-family="Ubuntu, sans-serif" opacity="0.8">{localTicket.ticketName || 'Attendee Pass'}</text>
        {:else}
          <rect x="58" y="136" width="34" height="34" rx="3" fill="#f4f4f4" />
          <g opacity="0.9">
            <circle cx="50" cy="55" r="14" fill="#ffffff" fill-opacity="0.3" />
            <circle cx="50" cy="52" r="4" fill="#ffffff" fill-opacity="0.8" />
            <path d="M 42,63 Q 42,56 50,56 Q 58,56 58,63" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2.5" stroke-linecap="round" />
          </g>
          <rect x="72" y="47" width="38" height="5" rx="2.5" fill="#ffffff" fill-opacity="0.9" />
          <rect x="72" y="57" width="24" height="5" rx="2.5" fill="#ffffff" fill-opacity="0.6" />
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

    <!-- Typography & Actions -->
    {#if localTicket}
      <h2 class="p-heading--3 u-no-margin--bottom">{localTicket.name}</h2>
      <p class="p-heading--5 u-text--muted u-sv1">
        {localTicket.designation} {#if localTicket.organisation} @ {localTicket.organisation}{/if}
      </p>
    {:else}
      <h2 class="p-heading--3 u-no-margin--bottom">No ticket added yet</h2>
      <p class="p-heading--5 u-text--muted u-sv1">
        Your digital pass will appear here<br>once you scan or upload it.
      </p>

      <button class="p-button--brand" style="width: 100%; max-width: 360px; margin-top: 1rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="5" height="5" rx="1"></rect>
          <rect x="16" y="3" width="5" height="5" rx="1"></rect>
          <rect x="3" y="16" width="5" height="5" rx="1"></rect>
          <path d="M21 16v5h-5"></path>
          <path d="M8 12h8"></path>
          <path d="M12 8v8"></path>
        </svg>
        Scan or Upload Ticket
      </button>
    {/if}
  {/if}

  <!-- Vanilla Framework Modal -->
  {#if showReplaceModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="p-modal" id="modal" style="display: flex;" on:keydown={handleModalKeydown}>
      <div class="p-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" bind:this={modalDialogEl}>
        <header class="p-modal__header">
          <h2 class="p-modal__title" id="modal-title">Replace Ticket?</h2>
        </header>
        <div class="p-modal__content" id="modal-description">
          <p>You already have a ticket saved on this device. Do you want to remove the old ticket and add the new one?</p>
        </div>
        <footer class="p-modal__footer">
          <button class="p-button" on:click={cancelReplace}>Cancel</button>
          <button class="p-button--brand" on:click={replaceTicket}>Replace Ticket</button>
        </footer>
      </div>
    </div>
  {/if}
</div>
