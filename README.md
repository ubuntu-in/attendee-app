# UbuCon India 2026 - Attendee App

A Progressive Web App (PWA) built for the attendees of UbuCon India 2026. This app is designed to provide quick, offline-first access to event information, schedules, ticketing, and venue details, using Canonical's official Vanilla Framework.

## 🚀 Tech Stack

- **Framework**: [Astro 5](https://astro.build/) - For blazing-fast static site generation and SPA-like client routing.
- **Styling**: [Vanilla Framework](https://vanillaframework.io/) (SCSS) - Canonical's design system, strictly configured via SCSS variables (no custom CSS classes permitted).
- **Offline Support**: Native Service Workers configured with a **Cache-First** strategy to ensure the app works flawlessly on spotty conference Wi-Fi.

## 📂 Repository Structure

```text
/
├── public/                     # Static assets (fonts, icons, manifest, service worker)
│   ├── font/                   # Locally hosted Ubuntu fonts (no external Google Fonts)
│   ├── img/                    # Logos and images
│   ├── manifest.json           # PWA configuration
│   └── sw.js                   # Cache-first Service Worker
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro    # Global HTML shell, navigation, and PWA registration
│   ├── pages/
│   │   ├── index.astro         # Home page
│   │   ├── schedule.astro      # Event schedule
│   │   ├── ticket.astro        # Attendee ticket / QR code
│   │   └── venue.astro         # Venue details and map
│   └── styles/
│       └── global.scss         # Vanilla Framework SCSS imports and variable overrides
├── astro.config.mjs            # Astro configuration (Vite, SCSS deprecation silence)
└── package.json                # Project dependencies and scripts
```

## 🛠️ Development

All commands are run from the root of the project.

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev -- --host`   | Starts local dev server accessible on local network|
| `npm run build`           | Builds your production site to `./dist/`         |
| `npm run preview`         | Previews your build locally                      |

## 🎨 Design System Rules

This project strictly adheres to Canonical's design language:
1. **No Custom CSS**: All styling must be achieved using Vanilla Framework's native classes or by overriding its SCSS variables in `global.scss`.
2. **Offline-First**: External CDNs (like Google Fonts) are completely disabled. All assets must be served from the `public/` directory and cached by `sw.js`.
3. **Colors**:
   - Ubuntu Orange: `#E95420`
   - Aubergine: `#772953`
   - Canonical Green: `#38B44A`
