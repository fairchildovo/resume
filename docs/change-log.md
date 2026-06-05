# Change Log

## 2026-06-05 - Restore original site icon

- Change: restored the original `favicon.ico`, `icon.png`, and `logo.svg` assets from the project baseline.
- Change: removed the added `/favicon.svg` asset and restored the original favicon metadata/link tags.
- Adjustment: restored the home header logo size to 60px.

## 2026-06-04 - Redesign site icon for Magic Resume

- Change: replaced the imported Hub mark with a project-specific resume document icon.
- Design: uses a rounded warm canvas, folded resume page, text lines, teal sparkle, and gold accent dot to signal resume editing with AI polish.
- Change: regenerated `favicon.svg`, `logo.svg`, `icon.png`, and `favicon.ico` from the new vector source.
- Adjustment: set the home header logo to 24px so it matches the 24px title text size.

## 2026-06-04 - Align site icon with Tianzora Hub

- Change: copied the Tianzora Hub favicon SVG/ICO into this project's public icon assets.
- Change: regenerated the 512px PWA `icon.png` from the Hub SVG and replaced `logo.svg` with the same mark for shared brand usage.
- Change: updated root document icon tags and compatibility metadata to prefer `/favicon.svg`, with `/favicon.ico` as fallback and `/icon.png` for Apple/PWA usage.
- Adjustment: scaled the icon artwork to 80% inside the standard square canvas so the Hub mark reads smaller in browser tabs, PWA icons, and in-page logo placements.
- Adjustment: reduced the home header logo from 60px to 30px so the visible 80%-scaled mark aligns with the 24px title text.

## 2026-06-04 - Prevent refresh FOUC from remote font import

- Root cause: `src/app/globals.css` started with a remote Google Fonts `@import`. The generated `dist/client/assets/globals-*.css` preserved that import before Tailwind rules, so the browser could delay applying the main stylesheet while resolving `fonts.googleapis.com`.
- Cloudflare impact: deployments should serve the built CSS and local font files from `dist/client` without relying on a request-time Google Fonts dependency.
- Change: removed the remote `@import` and changed Tailwind `font-serif` to a local/system serif stack.
- Change: added a custom TanStack Start server entry at `src/server.ts` so Cloudflare Worker SSR returns a plain `404` for missing static asset paths instead of SSR HTML.
- Regression guard: `scripts/server-static.test.mjs` now checks that the built global stylesheet contains no remote `@import` or `fonts.googleapis.com` dependency, and that the built Worker server entry returns plain `404` for missing static assets.
