<script lang="ts">
  import { formatTimeIST } from '../../lib/indico.js';
  import type { IndicoSession } from '../../lib/indico.js';
  import { bookmarksStore } from '../../lib/schedule.svelte.js';

  interface Props {
    session: IndicoSession;
  }

  const { session }: Props = $props();
  const isBookmarked = $derived(bookmarksStore.has(session.id));
</script>

<div class={session.isBreak ? 'p-card' : 'p-card p-card--highlighted'}>
  {#if !session.isBreak}
    <button
      type="button"
      class="p-button--base u-float-right u-no-margin--bottom"
      aria-label={`${isBookmarked ? 'Remove bookmark for' : 'Bookmark'} ${session.title}`}
      aria-pressed={isBookmarked}
      onclick={() => bookmarksStore.toggle(session.id)}
    >
      <span class="p-heading--3 u-no-margin" aria-hidden="true">{isBookmarked ? '★' : '☆'}</span>
    </button>
  {/if}
  <p class="u-no-margin--bottom">
    <small>
      {formatTimeIST(session.start)}&nbsp;&ndash;&nbsp;{formatTimeIST(session.end)}
    </small>
  </p>

  <h3 class="p-heading--5 u-no-margin--top">
    <a
      href={session.indicoUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {session.title}
    </a>
  </h3>

  {#if session.speakers.length > 0}
    <p class="u-no-margin--top u-no-margin--bottom u-text--muted">
      {session.speakers.join(', ')}
    </p>
  {/if}

  {#if session.room || session.track}
    <div class="u-sv1">
      {#if session.room}
        <span class="p-chip">
          <span class="p-chip__lead">Room</span>
          <span class="p-chip__value">{session.room}</span>
        </span>
      {/if}
      {#if session.track}
        <span class="p-chip--information">
          <span class="p-chip__value">{session.track}</span>
        </span>
      {/if}
    </div>
  {/if}
</div>
