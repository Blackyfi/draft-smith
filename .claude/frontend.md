# Frontend conventions (`src/`)

## Types & the Rust contract
- **TypeScript strict.** `src/types.ts` mirrors the Rust Tauri command/event payloads exactly; it is
  the single source of FE truth for the contract. When a Rust payload changes, update `types.ts` in
  the same change so the contract can't silently drift.
- Talk to Rust only through a thin bridge in `src/lib/` (wrap `invoke`/`listen`); components never
  call Tauri APIs directly.

## State ownership
- **TanStack Query** owns server-state: the Live Client polling lifecycle, caching, retries, and the
  game-start/end transitions. Don't hand-roll polling in components.
- **Zustand** owns small global UI state (active view, settings, pin-on-top). Keep it minimal.
- Recommendations arrive via the `recommendation-updated` Tauri event → feed Query cache; the UI
  re-ranks reactively. No recomputation in the FE — the engine is in Rust.

## UI / UX
- shadcn/ui + Radix primitives for anything interactive (dialog, tabs, tooltip, toast) — get a11y for free.
- Implement **all spec states** (PROJECT_SPEC.md §6.4): no-game, connecting/loading, in-game-early,
  enemy-build-shift, ddragon-offline-cached, error. Skeletons over blank flashes.
- **Respect `prefers-reduced-motion`** — gate Framer Motion transitions on it. Transitions ≤200ms;
  no layout shift on data updates.
- **Color is never the only signal** — every badge/chip pairs color with text + icon. Min 11px text.
- Dark-first; light mode supported via tokens.

## Style
- Tailwind v4 utility-first with design tokens; avoid bespoke CSS files.
- ESLint + Prettier clean (`npm run lint`). Components small and presentational; logic in hooks (`src/hooks/`).
