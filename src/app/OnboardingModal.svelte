<script lang="ts">
  import { changelog } from '../lib/changelog';

  let { show, onclose }: { show: boolean; onclose: () => void } = $props();

  let activeTab: 'welcome' | 'changelog' = $state('welcome');

  function handleBackdropClick() {
    onclose();
  }

  function handleCardClick(e: MouseEvent) {
    e.stopPropagation();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (show && e.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={handleBackdropClick}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="card" onclick={handleCardClick}>
      <button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>

      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'welcome'}
          onclick={() => (activeTab = 'welcome')}
        >
          Welcome
        </button>
        <button
          class="tab"
          class:active={activeTab === 'changelog'}
          onclick={() => (activeTab = 'changelog')}
        >
          What's New
        </button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'welcome'}
          <div class="welcome">
            <h1 class="hero">Sprite Sprout</h1>
            <p class="tagline">Clean up AI-generated pixel art in seconds</p>
            <p class="problem">
              AI image generators produce pixel art with anti-aliasing artifacts,
              inconsistent grids, and too many colors. Manual cleanup takes forever.
            </p>

            <div class="features">
              <div class="feature-card">
                <span class="feature-icon">🔍</span>
                <span class="feature-text">Auto grid detection & snap</span>
              </div>
              <div class="feature-card">
                <span class="feature-icon">🎨</span>
                <span class="feature-text">One-click color reduction</span>
              </div>
              <div class="feature-card">
                <span class="feature-icon">🔄</span>
                <span class="feature-text">Before/after preview</span>
              </div>
              <div class="feature-card">
                <span class="feature-icon">✏️</span>
                <span class="feature-text">Pencil, eraser, flood fill</span>
              </div>
              <div class="feature-card">
                <span class="feature-icon">🎯</span>
                <span class="feature-text">Palette editing & lock</span>
              </div>
              <div class="feature-card">
                <span class="feature-icon">📦</span>
                <span class="feature-text">PNG export & clipboard copy</span>
              </div>
            </div>

            <button class="cta" onclick={onclose}>Get Started</button>
          </div>
        {:else}
          <div class="changelog">
            {#each changelog as entry}
              <div class="changelog-entry">
                <div class="changelog-header">
                  <span class="changelog-version">{entry.version === 'unreleased' ? 'Unreleased' : `v${entry.version}`}</span>
                  <span class="changelog-date">{entry.date}</span>
                </div>
                <ul class="changelog-items">
                  {#each entry.items as item}
                    <li>{item}</li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        {/if}
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

  .card {
    position: relative;
    max-width: 560px;
    width: 100%;
    max-height: 85vh;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  .close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-surface);
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 16px 16px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .tab {
    flex: 1;
    padding: 10px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  /* Welcome tab */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .hero {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 8px;
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    color: var(--text-primary);
    font-size: 1.05rem;
    margin: 0 0 12px;
  }

  .problem {
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.55;
    margin: 0 0 24px;
    max-width: 440px;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    width: 100%;
    margin-bottom: 28px;
  }

  @media (min-width: 480px) {
    .features {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .feature-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 8px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    transition: border-color 0.15s;
  }

  .feature-card:hover {
    border-color: var(--accent);
  }

  .feature-icon {
    font-size: 1.5rem;
  }

  .feature-text {
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.35;
  }

  .cta {
    padding: 10px 32px;
    background: var(--accent);
    color: var(--bg-primary);
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .cta:hover {
    background: var(--accent-hover);
  }

  /* Changelog tab */
  .changelog-entry {
    margin-bottom: 24px;
  }

  .changelog-entry:last-child {
    margin-bottom: 0;
  }

  .changelog-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 10px;
  }

  .changelog-version {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--accent);
  }

  .changelog-date {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .changelog-items {
    margin: 0;
    padding-left: 20px;
    list-style: disc;
  }

  .changelog-items li {
    color: var(--text-primary);
    font-size: 0.85rem;
    line-height: 1.6;
    margin-bottom: 4px;
  }

  .changelog-items li:last-child {
    margin-bottom: 0;
  }
</style>
