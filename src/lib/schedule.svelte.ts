import { fetchSchedule, groupByDay, type IndicoSession } from './indico.js';
import { EVENT_CONFIG } from '../config.js';

const BOOKMARKS_STORAGE_KEY = 'uci:bookmarks';

export const bookmarksStore = $state({
  bookmarkedIds: new Set<string>(),
  isInitialized: false,

  init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY) ?? '[]');
      if (Array.isArray(stored)) {
        this.bookmarkedIds = new Set(stored.filter((id) => typeof id === 'string'));
      }
    } catch {
      // Browser storage may be unavailable; keep bookmarks usable in memory.
    }
  },

  toggle(id: string) {
    this.init();
    const next = new Set(this.bookmarkedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.bookmarkedIds = next;
    try {
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Browser storage may be unavailable; keep bookmarks usable in memory.
    }
  },

  has(id: string): boolean {
    return this.bookmarkedIds.has(id);
  },
});

export const scheduleStore = $state({
  status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
  sessionsByDay: new Map<string, IndicoSession[]>(),
  errorMessage: null as string | null,

  async load() {
    if (this.status === 'loading' || typeof window === 'undefined') return;
    this.status = 'loading';
    this.errorMessage = null;

    try {
      const sessions = await fetchSchedule(EVENT_CONFIG.indicoId);
      this.sessionsByDay = groupByDay(sessions);
      this.status = 'success';
    } catch (err) {
      this.errorMessage = err instanceof Error && err.name === 'TimeoutError'
        ? 'Request timed out. Please check your connection and try again.'
        : err instanceof Error ? err.message : 'Failed to load schedule';
      this.status = 'error';
    }
  },
});
