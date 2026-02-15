<script lang="ts">
  let {
    show,
    title,
    message,
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    onconfirm,
    oncancel,
  }: {
    show: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (show && e.key === 'Escape') {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={oncancel}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3 class="dialog-title">{title}</h3>
      <p class="dialog-message">{message}</p>
      <div class="dialog-actions">
        <button class="btn cancel-btn" onclick={oncancel}>{cancelLabel}</button>
        <button class="btn confirm-btn" onclick={onconfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .dialog {
    max-width: 400px;
    width: 100%;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 20px;
  }

  .dialog-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px;
  }

  .dialog-message {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    padding: 6px 14px;
    font-size: 12px;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid var(--border-color);
  }

  .cancel-btn {
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .cancel-btn:hover {
    background: var(--border-color);
  }

  .confirm-btn {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  .confirm-btn:hover {
    opacity: 0.9;
  }
</style>
