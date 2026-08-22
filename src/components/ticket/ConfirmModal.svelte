<script lang="ts">
  interface Props {
    title: string;
    description: string;
    dismissLabel?: string;
    confirmLabel: string;
    confirmVariant?: 'positive' | 'negative';
    confirmIcon?: string;
    onDismiss: () => void;
    onConfirm: () => void;
  }

  let {
    title,
    description,
    dismissLabel = 'Cancel',
    confirmLabel,
    confirmVariant = 'positive',
    confirmIcon,
    onDismiss,
    onConfirm,
  }: Props = $props();
</script>

<div class="p-modal">
  <div
    class="p-modal__dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    aria-describedby="modal-desc"
  >
    <header class="p-modal__header">
      <h2 class="p-modal__title" id="modal-title">{title}</h2>
      <button class="p-modal__close" type="button" aria-label={dismissLabel} onclick={onDismiss} autofocus>
        Close
      </button>
    </header>
    <p id="modal-desc">{description}</p>
    <footer class="p-modal__footer">
      <button
        class="p-button has-icon"
        type="button"
        onclick={onDismiss}
        aria-label={dismissLabel}
        title={dismissLabel}
      >
        <i class="p-icon--close"></i>
      </button>
      <button
        class={`p-button--${confirmVariant} has-icon`}
        type="button"
        onclick={onConfirm}
        aria-label={confirmLabel}
        title={confirmLabel}
      >
        <i class={confirmIcon}></i>
      </button>
    </footer>
  </div>
</div>
