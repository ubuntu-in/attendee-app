import { fetchSchedule, groupByDay, type IndicoSession } from './indico.js';
import { EVENT_CONFIG } from '../config.js';

type Status = 'idle' | 'loading' | 'success' | 'error';

class ScheduleStore {
  status = $state<Status>('idle');
  sessionsByDay = $state<Map<string, IndicoSession[]>>(new Map());
  errorMessage = $state<string | null>(null);

  private loadGeneration = 0;

  async load(): Promise<void> {
    const loadGen = ++this.loadGeneration;
    this.status = 'loading';
    this.errorMessage = null;

    try {
      const sessions = await fetchSchedule(EVENT_CONFIG.indicoId);

      if (loadGen !== this.loadGeneration) return;

      this.sessionsByDay = groupByDay(sessions);
      this.status = 'success';
    } catch (err) {
      if (loadGen !== this.loadGeneration) return;
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.errorMessage = 'Request timed out. Please check your connection and try again.';
      } else {
        this.errorMessage = err instanceof Error ? err.message : 'Failed to load schedule from Indico';
      }
      this.status = 'error';
    }
  }
}

export const scheduleStore = new ScheduleStore();
