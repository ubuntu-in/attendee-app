<script lang="ts">
  import { formatTimeIST } from '../../lib/indico.js';
  import type { IndicoSession } from '../../lib/indico.js';

  interface Props {
    session: IndicoSession;
  }

  const { session }: Props = $props();
</script>

<a
  href={session.indicoUrl}
  class="p-card p-card--highlighted"
  style="display: block; color: inherit; text-decoration: none;"
>
  <p class="u-no-margin--bottom">
    <small>
      {formatTimeIST(session.start)}&nbsp;&ndash;&nbsp;{formatTimeIST(session.end)}
    </small>
  </p>

  <h3 class="p-heading--5 u-no-margin--top">{session.title}</h3>

  {#if session.speakers.length > 0}
    <p class="u-no-margin--top u-no-margin--bottom">
      {session.speakers.join(', ')}
    </p>
  {/if}

  {#if session.room || session.track}
    <div class="u-sv1">
      {#if session.room}
        <span class="p-chip">
          <span class="p-chip__label">{session.room}</span>
        </span>
      {/if}
      {#if session.track}
        <span class="p-chip">
          <span class="p-chip__label">{session.track}</span>
        </span>
      {/if}
    </div>
  {/if}
</a>
