# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goal
**DraftSmith** — a Tauri desktop app that detects the live LoL matchup and continuously
recommends what to build next, for **any champion**, reacting to enemies' actual purchases.
`PROJECT_SPEC.md` is the authoritative source of truth; if anything here conflicts with it, the spec wins.

## Non-negotiable constraints
These are correctness/compliance invariants, not preferences. Violating any is a defect:

1. **In-game data is Riot-sanctioned ONLY** — the live matchup comes from the Live Client Data API
   (`https://127.0.0.1:2999/liveclientdata/`) and Data Dragon CDN. Absolutely no memory reading, DLL
   injection, packet sniffing, or the keyed REST API (v1). (Tier B meta-build stats are a *separate*,
   out-of-game, owner-approved third-party source — see constraint #7.)
2. **TLS exception scoped to `127.0.0.1:2999` only.** The Live Client self-signed cert is accepted
   *only* for that host:port. Never globally disable cert verification (`danger_accept_invalid_certs`
   must be on a client used exclusively for the local endpoint).
3. **Advisory only.** The app never buys, clicks, or acts in-game. It recommends; the player decides.
4. **The engine is data-driven — no champion/item/patch hardcoded in engine control flow.**
   Adding a champion/item/patch is a *data* change (`src-tauri/src/rules/data/*.json`), never an
   engine code change. If you reach for `match champion_name { ... }` in `engine/`, stop and move it
   to data. (See §5 of the spec and `.claude/rust.md`.)
5. **No Arena items or Augment win rates** displayed, ever.
6. **Never hardcode the patch version** — discover via DDragon `versions.json`.
   **Never fetch DDragon during a game** — cache to disk; refresh only on patch change.
7. **Tier B meta-build stats (u.gg) are third-party and advisory.** The "highest win-rate build"
   Meta panel is sourced from u.gg's public stats JSON — *not* Riot-sanctioned, a deliberate
   owner-approved relaxation of the original "Riot data only" stance (PROJECT_SPEC §3.5). It is
   fetched at most once per champion at game start and cached to disk (one overview holds all
   roles/ranks; never polled mid-game), **Summoner's Rift builds only**, and presented as advisory
   ("what wins on average"), never automation. Constraint #5 (no Arena/Augment win rates) still holds
   absolutely. Use a *separate* ordinary HTTP client with a browser User-Agent — never the
   `127.0.0.1:2999` cert-exception client.

## Stack (see PROJECT_SPEC.md §2 for rationale)
- **Shell:** Tauri v2 (v2.10+) — Rust core in `src-tauri/`.
- **Frontend:** React 19 + TypeScript (strict) + Vite + Tailwind CSS v4 + shadcn/ui.
  (PROJECT_SPEC §2 says React 18; intentionally on 19 — current stable — by owner decision.)
- **FE state:** TanStack Query (Live Client polling lifecycle) + Zustand (UI state); Framer Motion; lucide-react.
- **Rust:** tokio (async poller), reqwest + serde (HTTP/JSON), insta (engine snapshot tests).
- **Tests:** `cargo test` + insta (Rust); Vitest + React Testing Library (TS).

## Commands
> The scaffold lands in M0; these are the canonical commands once it exists.
- Dev: `npm run tauri dev`
- Build: `npm run tauri build`
- Mock live game (verify the FE↔Rust loop without League): `npm run mock` serves the captured
  `/allgamedata` fixture over TLS on `127.0.0.1:2999` and walks a scripted enemy-purchase timeline,
  so `npm run tauri dev` shows the build re-ranking live. Stop League first (it owns that port).
- Rust test (single): `cargo test <name>` in `src-tauri/`; snapshot review: `cargo insta review`
- TS test: `npm run test`; single: `npm run test -- <pattern>`
- Lint/format: `cargo clippy --all-targets -- -D warnings`, `cargo fmt`, `npm run lint`

## Architecture (big picture; full detail in PROJECT_SPEC.md §4)
Data flows **one direction**: sources → Rust core → typed Tauri events → React.
- `live_client/` polls `127.0.0.1:2999` (2–5s, scoped cert), yields typed `/allgamedata`.
- `ddragon/` resolves item/champ IDs → metadata + icon paths from a disk cache.
- `poll/` diffs game-state and only recomputes when something changed, then emits Tauri events.
- `engine/` is the **pure, data-driven brain**: `classify_enemy(...) -> ThreatProfile` and
  `recommend(...) -> Recommendation`. **No I/O, no clock, no randomness** — same inputs ⇒ same output.
- `rules/data/*.json` hold champion profiles, item intent-tags, and archetype→counter mappings.
- FE↔Rust contract (commands + events) is typed both sides; keep `src/types.ts` in sync with Rust
  types so the contract can't silently drift (PROJECT_SPEC.md §4.2).

## Workflow
- Work **milestone by milestone (M0→M7)**. Each milestone: plan in Plan Mode → approval → implement
  → verify per the spec's milestone criteria → `code-reviewer` → commit.
- **Verify before declaring done.** M2/M4 must work against a **mock local server** serving captured
  `/allgamedata` JSON (no League needed). M3 must be `cargo test`-green incl. the Ahri fixture set + ≥3 other archetypes.
- Prefer subagents for isolated work: `rust-engine`, `ui-builder`, `code-reviewer`; use **Explore** for
  read-only API/library investigation to keep the main context clean.

## Changelog & releases
- **`CHANGELOG.md` is rendered in-app** (Settings → What's new) by a minimal renderer that only
  understands `##` (version), `###` (section), and `- ` (bullet) lines — any other non-empty line
  shows as a visible paragraph, so **never** put HTML comments or prose notes in the file.
- **From v0.1.8 on, split each version entry into `###` sections** — at minimum **New features** and
  **Fixes**, plus **Improvements** (or **Changed**) when relevant. Keep entries user-facing/plain.
- Release flow is CI-driven (local builds can't sign): bump `package.json` + `src-tauri/tauri.conf.json`
  + `src-tauri/Cargo.toml` (then `cargo update -p draftsmith`), commit, tag `vX.Y.Z`, push → `release.yml`
  builds the signed installer + `latest.json` as a **draft**; the owner publishes it.

## Gotchas
- Live Client **refuses connection outside a game** — that is the "no game" state, not an error to surface loudly.
- Live Client `/activeplayer` gold is limited; gold is partly inferred (PROJECT_SPEC.md §6.4).
- Tolerate malformed/missing API fields — never crash on a partial `/allgamedata`.
- Send `Accept-Charset: UTF-8` to DDragon.

## Detailed conventions
@.claude/rust.md
@.claude/frontend.md
