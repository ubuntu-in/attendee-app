<script lang="ts">
  import { onMount } from 'svelte';
  import { qrcode } from 'etiket';
  import {
    buildQRPayload,
    loadTicket,
    removeTicket,
    type StoredTicket,
  } from '../../lib/ticket.js';
  import ConfirmModal from './ConfirmModal.svelte';

  const base = import.meta.env.BASE_URL;

  type Phase = 'checking' | 'view' | 'confirmRemove';

  let ticket = $state<StoredTicket | null>(null);
  let phase = $state<Phase>('checking');
  let logoSvg = $state<string | undefined>();
  let qrSvg = $derived(ticket ? buildQrSvg(ticket, logoSvg) : '');

  onMount(async () => {
    ticket = loadTicket();
    if (!ticket) {
      window.location.assign(`${base}ticket/add`);
      return;
    }
    phase = 'view';
    logoSvg = await fetch(`${base}favicon.svg`)
      .then((res) => (res.ok ? res.text() : undefined))
      .then(sanitizeLogoSvg)
      .catch(() => undefined);
  });

  function sanitizeLogoSvg(raw: string | undefined): string | undefined {
    return raw
      ?.replace(/<\?xml[^?]*\?>/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="[^"]*"/g, ''));
  }

  function buildQrSvg(value: StoredTicket, logo?: string): string {
    const eye = { outerColor: '#38B44A', innerColor: '#E95420' } as const;
    return qrcode(buildQRPayload(value), {
      size: 200,
      margin: 2,
      ecLevel: 'H',
      dotType: 'classy',
      corners: { topLeft: eye, topRight: eye, bottomLeft: eye },
      logo: logo
        ? { svg: logo, size: 0.22, margin: 4}
        : undefined,
      ariaLabel: 'Ticket QR code',
    });
  }

  function confirmRemoval() {
    removeTicket();
    window.location.assign(`${base}ticket/add`);
  }
</script>

{#if phase === 'checking'}
  <div class="u-align-text--center" role="status" aria-label="Loading ticket">
    <i class="p-icon--spinner u-animation--spin" style="font-size: 2rem;"></i>
  </div>
{:else if ticket}
  <div class="p-card--highlighted">
    <div class="p-card__inner u-align-text--center">
      <div class="u-sv2">{@html qrSvg}</div>

      <h1 class="p-heading--3 u-no-margin--bottom">{ticket.attendee.name}</h1>
      <p class="p-heading--5 u-text--muted">{ticket.attendee.ticketName || 'Attendee Pass'}</p>
      {#if ticket.attendee.designation || ticket.attendee.organisation}
        <p class="u-text--muted">
          {ticket.attendee.designation || ''}{#if ticket.attendee.designation && ticket.attendee.organisation}{' at '}{/if}{ticket.attendee.organisation || ''}
        </p>
      {/if}

      {#if phase === 'view'}
        <p class="u-sv2">
          <button class="p-button--positive has-icon" type="button" onclick={() => window.location.assign(`${base}ticket/add`)}
            aria-label="Replace ticket" title="Replace ticket">
            <i class="p-icon--edit is-dark"></i>
            <span>Replace</span>
          </button>
          <button class="p-button--negative has-icon" type="button" onclick={() => phase = 'confirmRemove'}
            aria-label="Remove ticket" title="Remove ticket">
            <i class="p-icon--delete is-dark"></i>
          </button>
        </p>
      {/if}
    </div>
  </div>

  {#if phase === 'confirmRemove'}
    <ConfirmModal
      title="Remove this ticket?"
      description={`Attendee data for ${ticket.attendee.name} will be deleted from this device.`}
      dismissLabel="Cancel"
      confirmLabel="Confirm removal"
      confirmVariant="negative"
      confirmIcon="p-icon--delete is-dark"
      onDismiss={() => (phase = 'view')}
      onConfirm={confirmRemoval}
    />
  {/if}
{/if}
