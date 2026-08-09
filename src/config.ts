export const EVENT_CONFIG = {
  indicoBaseUrl: 'https://events.canonical.com',
  // Read from PUBLIC_INDICO_EVENT_ID env var so the event ID can be changed
  // for future UbuCon editions without modifying source code.
  // Falls back to 157 (UbuCon India 2026) for local dev without a .env file.
  indicoEventId: Number(import.meta.env.PUBLIC_INDICO_EVENT_ID ?? 157),
  timezone: 'Asia/Kolkata',
} as const;
