# UbuCon India 2026 - Attendee App

A small installable web app for UbuCon India 2026 attendees. It provides fast access to the ticket, current schedule, venue guidance, event conduct, and event broadcasts before and during the event.

Product intent, scope, and decisions live in [PRD.md](PRD.md).

## Tech Stack

- **Framework**: [Astro](https://astro.build/) (static output by default) with Svelte 5 client islands.
- **Runtime and package manager**: [Bun](https://bun.sh/), versions pinned in `bun.lock`.
- **Styling**: [Vanilla Framework](https://vanillaframework.io/) (SCSS) with component-scoped custom CSS where a Vanilla pattern does not fit.
- **Offline Support**: Service Worker caches app assets and the last successful schedule response for offline reading after first use.
- **Schedule source**: [Indico](https://docs.getindico.io) through the app's own `/api/schedule` proxy.

## Repository Structure

```text
/
├── public/                 # Static assets: manifest, icons, service worker
├── src/
│   ├── components/         # Shared UI and interactive client islands
│   │   ├── schedule/       # Schedule island
│   │   └── ticket/         # Ticket add/view components
│   ├── layouts/            # Document shell and metadata
│   ├── lib/                # Pure domain logic and external-service adapters
│   ├── pages/              # Routes and thin API handlers
│   │   ├── api/schedule.ts # Indico proxy (Worker route)
│   │   └── ticket/         # /ticket/add route
│   ├── styles/             # Vanilla settings and shared shell rules
│   └── config.ts           # Annual event configuration
├── tests/                  # Small tests for business-critical logic
├── astro.config.mjs
└── package.json            # Project dependencies and scripts
```

## Development

Run from the project root.

| Command                                | Action                                        |
| :------------------------------------- | :-------------------------------------------- |
| `bun install`                          | Installs dependencies                         |
| `bun run check`                        | Type and template diagnostics                 |
| `bun test`                             | Run pure logic tests                          |
| `bun run dev`                          | Start the local dev server                    |
| `bun run build`                        | Build the production site to `./dist/`        |
| `bun run preview`                      | Preview a local build                         |

## Event Configuration

Annual event details (name, dates, venue, Indico origin and event ID, ticket event ID) are typed in one place: `src/config.ts`. Public configuration is kept in source. Secrets use platform stores (Cloudflare, Firebase), never Git. `.env.example` lists names only.

## Design System Rules

- Use semantic HTML first, then documented Vanilla patterns, then small component-scoped CSS.
- External CDNs are disabled; assets are served and cached by the app.
- Brand colors:
  - Ubuntu Orange: `#E95420`
  - Aubergine: `#772953`
  - Canonical Green: `#38B44A`