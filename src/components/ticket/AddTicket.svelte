<script lang="ts">
  import { onMount } from 'svelte';
  import { EVENT_CONFIG } from '../../config.js';
  import {
    fetchTicket,
    loadTicket,
    parseQRPayload,
    saveTicket,
    type StoredTicket,
  } from '../../lib/ticket.js';
  import ConfirmModal from './ConfirmModal.svelte';

  let phase = $state<'idle' | 'busy' | 'confirm' | 'error'>('idle');
  let message = $state('');
  let bookingId = $state('');
  let existingTicket = $state<StoredTicket | null>(null);

  onMount(() => {
    existingTicket = loadTicket();
    const url = new URL(window.location.href);
    const id = url.searchParams.get('bookingid')?.trim();
    if (!id) return;

    history.replaceState(null, '', `${url.pathname}${url.hash}`);
    void handleBookingId(id);
  });

  async function handleBookingId(id: string) {
    if (existingTicket?.bookingId === id) {
      window.location.assign('/ticket');
      return;
    }
    bookingId = id;
    if (existingTicket) {
      phase = 'confirm';
      return;
    }
    await fetchAndSave();
  }

  async function fetchAndSave() {
    phase = 'busy';
    message = 'Validating ticket...';
    try {
      saveTicket(await fetchTicket(bookingId));
      window.location.assign('/ticket');
    } catch (error) {
      fail(error, 'Could not add this ticket.');
    }
  }

  function dismiss() {
    if (existingTicket) {
      window.location.assign('/ticket');
    } else {
      phase = 'idle';
    }
  }

  function fail(error: unknown, fallback: string) {
    phase = 'error';
    message = error instanceof Error ? error.message : fallback;
  }

  async function readQR(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    phase = 'busy';
    message = 'Reading QR code...';
    try {
      if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
      const parsed = parseQRPayload(await scanQrFromFile(file));
      if (!parsed) {
        throw new Error(`This is not a valid ticket for this event (${EVENT_CONFIG.id}).`);
      }
      await handleBookingId(parsed.bookingId);
    } catch (error) {
      fail(error, 'Could not read that image. Please try another one.');
    }
  }

  async function scanQrFromFile(file: File): Promise<string> {
    const { default: QrScanner } = await import('qr-scanner');
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      return result.data;
    } catch {
      throw new Error('No QR code was found in that image.');
    }
  }
</script>

<div class="u-align-text--center">
  <h1 class="p-heading--2">Add your ticket</h1>
  <p>Scan the QR code from your ticket.</p>
  <div>
    <label class="p-button--positive has-icon" for="ticket-qr-input">
      <i class="p-icon--screenshot is-dark"></i><span>Scan QR code</span><input id="ticket-qr-input" type="file" accept="image/*" onchange={readQR} hidden>
    </label>
  </div>

  {#if phase === 'busy'}
    <div role="status" aria-live="polite" class="u-sv3">
      <i class="p-icon--spinner u-animation--spin"></i>
      <p>{message}</p>
    </div>
  {/if}

  {#if phase === 'idle'}
    <div class="u-align-text--center" style="max-width: 360px; margin: 2rem auto 0;">
      <p class="p-heading--5 u-no-margin--bottom">How to add your ticket</p>
      <ol style="display: inline-block; text-align: left;">
        <li>Open your registration confirmation email from KonfHub.</li>
        <li>Save the QR code image to your device.</li>
        <li>Tap <strong>Scan QR code</strong> above and select the image.</li>
        <li>Your ticket is saved offline on this device.</li>
      </ol>
    </div>
  {/if}
</div>

{#if phase === 'confirm' && existingTicket}
  <ConfirmModal
    title="Replace saved ticket?"
    description={`This device already has a ticket for <strong>${existingTicket.attendee.name}</strong>.`}
    dismissLabel="Keep current ticket"
    confirmLabel="Replace ticket"
    confirmVariant="positive"
    confirmIcon="p-icon--task-outstanding is-dark"
    onDismiss={dismiss}
    onConfirm={fetchAndSave}
  />
{:else if phase === 'error'}
  <ConfirmModal
    title="Ticket not added"
    description={message}
    dismissLabel="Dismiss"
    confirmLabel="Try again"
    confirmVariant="positive"
    confirmIcon="p-icon--restart is-dark"
    onDismiss={dismiss}
    onConfirm={() => bookingId && fetchAndSave()}
  />
{/if}
