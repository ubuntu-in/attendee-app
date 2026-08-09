<script lang="ts">
  import SessionCard from './SessionCard.svelte';
  import type { IndicoSession } from '../../lib/indico.js';

  interface Props {
    sessions: IndicoSession[];
  }

  const { sessions }: Props = $props();
</script>

{#each sessions as session (session.id)}
  <SessionCard {session} />
{/each}
