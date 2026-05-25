# Project Specification — "DraftSmith" LoL Live Item Coach

> A modern, lightweight desktop companion for League of Legends that detects the
> live matchup and continuously recommends what to build next — for **any
> champion**, against **any enemy**, reacting in real time to what the enemy
> actually buys. Porofessor-style, but item-recommendation-focused, fully on
> Riot-sanctioned data, and engineered as a production-grade product.

---

## 1. Goal & Product Vision

### 1.1 One-sentence goal
Give a League of Legends player, mid-game and at a glance, a **continuously
updated, matchup-aware item recommendation** for the champion they are currently
playing — adapting live to the enemy team's composition and their *actual*
purchases — through a clean desktop window that lives beside the game.

### 1.2 What it is NOT (scope guardrails)
- **Not** an overlay that injects into or reads the game's memory. Data comes
  **only** from Riot's sanctioned **Live Client Data API** (local) and **Data
  Dragon** (static CDN). No memory reading, no DLL injection, no packet sniffing.
- **Not** an automation tool. It *advises*; it never buys, clicks, or acts in the
  game. (Riot policy: products may not dictate player decisions or auto-act.)
- **Not** champion-specific. Ahri was the original prototype idea; the shipped
  product must handle **all champions dynamically** via a data-driven rules +
  stats model. No champion is hardcoded into the engine's control flow.

### 1.3 Generalization principle (the core design requirement)
The recommendation engine must be **fully data-driven**. Adding support for a new
champion, a new item, or a new patch must require **only data changes** (JSON /
config / a downloaded stats blob), **never code changes** to the engine. The
engine reasons over abstract inputs:

- **Player champion profile** — damage type (AP/AD/hybrid/true), role archetype
  (burst mage / artillery / assassin / marksman / bruiser / tank / enchanter /
  battlemage), scaling, key power-spike items, and a per-champion "build graph"
  of viable items with conditions.
- **Enemy threat model** — for each enemy, derived archetype + live signals:
  damage type they deal, whether they're stacking health/armor/MR, whether they
  have hard CC, burst vs sustained, healing/shielding, mobility.
- **Game-state signals** — gold, level, items owned by everyone (from the live
  API), kills/deaths, dragon/baron state where exposed.

The output is an **ordered, explained build path** (I1 → I6) plus situational
swaps, each item carrying a **human-readable reason** ("Zhonya's 2nd — enemy Zed
is a lethality assassin; stasis negates his all-in window").

### 1.4 Target user & platform
- **Primary user:** ranked/solo-queue players (Emerald-and-around skill band) who
  want fast, defensible itemization help without alt-tabbing to a website.
- **Primary platform:** Windows 10/11 (where the LoL client runs). Architecture
  must remain cross-platform-capable (Tauri/Rust), but Windows is the only
  shipping target for v1.

---

## 2. Tech Stack (state of the art, 2026)

| Layer | Choice | Why |
|---|---|---|
| App shell | **Tauri v2** (v2.10+, Rust core) | Native webview (no bundled Chromium): ~3–10 MB binary, low idle RAM, first-class tray + auto-updater + code signing. The modern professional desktop choice. |
| Backend / domain logic | **Rust** (in `src-tauri`) | Polling loop, Live Client cert handling, Data Dragon cache, and the recommendation engine all live here as typed, testable domain logic. |
| Frontend framework | **React 18 + TypeScript (strict)** | Type-safe UI; the entire data model (champions, items, recs) is typed end to end. |
| Build tool | **Vite** | Standard modern bundler; fast HMR. |
| Styling | **Tailwind CSS v4** | Utility-first; fast iteration; design tokens. |
| Components | **shadcn/ui** (Radix primitives) | Accessible, polished primitives (dialog, tabs, tooltip, toast) without hand-rolling. |
| Server-state / polling | **TanStack Query** | Manages the Live Client polling lifecycle, caching, retries, and "game ended" transitions cleanly. |
| UI state | **Zustand** | Small global UI state (active view, settings, overlay-vs-window). |
| Animation | **Framer Motion** | Smooth, restrained transitions for the "next item" updates. |
| Icons | **lucide-react** | Consistent modern icon set. |
| Rust HTTP | **reqwest** (with `danger_accept_invalid_certs` scoped ONLY to the local Live Client) + **serde** | Live API + Data Dragon fetch, JSON (de)serialization. |
| Rust async | **tokio** | Async runtime for the poller. |
| Testing (Rust) | **cargo test** + **insta** (snapshot) | Unit-test the engine against fixture game-states. |
| Testing (TS) | **Vitest** + **React Testing Library** | Component + hook tests. |
| E2E (optional v1.1) | **Playwright** against a mocked API server | Smoke-test the full UI loop. |
| Lint/format | **ESLint + Prettier** (TS), **clippy + rustfmt** (Rust) | Enforced via hooks + CI. |
| CI | **GitHub Actions** | Lint, test, build matrix; bundle Windows installer. |

### 2.1 Stack tradeoff note
Electron is the easier, larger-ecosystem alternative (VS Code/Slack/Discord use
it) and would be a defensible choice optimizing for speed-to-ship. Tauri is
chosen here deliberately for footprint, performance, and "professional product"
signal, per the explicit project requirement. This is a genuine tradeoff, not a
settled fact.

---

## 3. Data Sources (both Riot-official)

### 3.1 Live Client Data API — *local, dynamic*
- Endpoint base: `https://127.0.0.1:2999/liveclientdata/`
- Key calls:
  - `/allgamedata` — everything in one shot (all players, their champions,
    scores, items, the active player, game time, events).
  - `/playerlist` — players + their `items[]` (item IDs, counts, slots).
  - `/activeplayer` — the local player (current gold via `/activeplayer` is
    limited; gold is partly inferred — see §6.4).
  - `/gamestats` — game time, map, mode.
- **Self-signed certificate:** the endpoint serves Riot's local self-signed cert.
  The Rust client must accept it **only for `127.0.0.1:2999`** (scope the
  exception tightly; never globally disable TLS verification). This is the #1
  "it won't connect" gotcha and must be handled from day one.
- **Lifecycle:** only responds while a live game is in progress. Before/after a
  game the connection refuses — the app treats this as the "no game" state, not
  an error to surface loudly.
- **No Riot-side rate limit** (it's your own machine). Poll every **2–5 s**
  (configurable). Diff results; only recompute when something changed.

### 3.2 Data Dragon (DDragon) — *remote, static*
- Base: `https://ddragon.leagueoflegends.com/`
- Version discovery: `GET /api/versions.json` → first element is latest patch.
  (Optionally cross-check region realm files, since regions update at different
  times.)
- Static files (per patch):
  - `/cdn/<ver>/data/en_US/item.json` — item IDs → names, stats, gold, tags,
    build-into/from trees.
  - `/cdn/<ver>/data/en_US/champion.json` — champion list + tags.
  - `/cdn/<ver>/data/en_US/champion/<Name>.json` — per-champion detail.
  - `/cdn/<ver>/img/item/<id>.png`, `/img/champion/<name>.png` — icons.
- **Rate limits:** none meaningful — it's a static CDN, *not* the keyed REST API.
  Best practice (and Riot's own guidance): **cache to disk**, load from disk,
  hit the CDN only when the patch changes (≈ every 2 weeks). Send
  `Accept-Charset: UTF-8`.
- **Caching strategy:** on launch, read cached `version`. Fetch
  `versions.json`; if newer, download item/champion JSON + needed icons into the
  app data dir, then update the cached version marker. Otherwise work fully
  offline from cache. Never fetch DDragon during a game.

### 3.3 Optional future source — Riot REST API (keyed)
Not required for v1. Could later enrich pre-game (ranked context, mastery) via
RSO. Subject to the real rate limits (≈20 req/s, 100 req/2 min on a dev key) and
requires registering the product. Explicitly **out of scope for v1**.

### 3.4 Compliance constraints (bake into product behavior)
- Advisory only; never auto-act or "dictate decisions."
- Do **not** display win rates for Arena items or Augments.
- Only use information already available to the player in their own live game.
- Register the product with Riot before any public distribution.

---

## 4. Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Live Client API (local)│     │  Data Dragon CDN (remote) │
│  127.0.0.1:2999         │     │  static, cached to disk    │
│  who + items, live      │     │  IDs → names + icons       │
└───────────┬─────────────┘     └─────────────┬─────────────┘
            │ poll 2–5s (self-signed cert)     │ once per patch
            ▼                                  ▼
┌───────────────────────────────────────────────────────────┐
│                  RUST CORE  (src-tauri)                     │
│                                                             │
│  Poller  ──►  Game-state diff  ──►  Resolver (IDs→meta)     │
│                                          │                  │
│                                          ▼                  │
│                          ┌───────────────────────────┐     │
│                          │   RECOMMENDATION ENGINE     │     │
│                          │  (pure, data-driven, tested)│     │
│                          │  classify enemies → archetype     │
│                          │  match player build-graph rules    │
│                          │  rank items → ordered path + why   │
│                          └───────────────┬───────────┘     │
│  Local cache (patch data, rules, prefs)  │                  │
└──────────────────────────────────────────┼─────────────────┘
                  Tauri commands + events    │ (typed payloads)
                                             ▼
┌───────────────────────────────────────────────────────────┐
│            FRONTEND  (React + TS + Tailwind)                │
│   Tray icon  ◄──►  Main window (live recs, smooth UI)       │
└───────────────────────────────────────────────────────────┘
```

### 4.1 Rust core modules (`src-tauri/src/`)
- `live_client/` — HTTP client with scoped self-signed cert acceptance; typed
  structs for `/allgamedata` etc.; "is a game running?" detection.
- `ddragon/` — version check, fetch, on-disk cache, ID→metadata maps, icon paths.
- `model/` — domain types: `Champion`, `Item`, `ItemTags`, `DamageType`,
  `Archetype`, `GameState`, `EnemyThreat`, `Recommendation`, `BuildStep`.
- `engine/` — **the brain**. Pure functions: `classify_enemy(enemy, items) ->
  ThreatProfile`, `recommend(player, allies, enemies, gamestate, rules) ->
  Recommendation`. No I/O. Fully unit-tested with fixtures.
- `rules/` — data-driven rule sets (loaded from JSON/RON): champion profiles,
  item-intent tags, archetype→counter-item mappings, situational triggers.
- `poll/` — tokio loop tying it together; diffs state; emits Tauri events.
- `commands.rs` — `#[tauri::command]` handlers exposed to the frontend.
- `tray.rs` — `TrayIconBuilder` setup, menu, show/hide window, status.
- `lib.rs` / `main.rs` — Tauri builder, plugin registration, setup hook.

### 4.2 Tauri command/event contract (typed both sides)
- **Commands (FE→Rust):** `get_status()`, `get_current_recommendation()`,
  `get_settings()`, `set_settings(s)`, `force_refresh_ddragon()`,
  `get_champion_meta(id)`.
- **Events (Rust→FE):** `game-state-changed` (payload: summary),
  `recommendation-updated` (payload: full `Recommendation`),
  `connection-status` (`no-game | connecting | in-game | error`),
  `ddragon-status` (`checking | updating | ready | offline`).
- Generate matching TS types from the Rust types (e.g. `ts-rs` or a hand-kept
  `types.ts` validated in CI) so the contract can't silently drift.

---

## 5. The Recommendation Engine (detailed, generalized)

### 5.1 Inputs
- `player`: champion profile (from rules data, keyed by champ ID).
- `enemies[]`: each with champ profile + live `items[]` + level + KDA.
- `allies[]`: for comp context (e.g. "team lacks magic damage → consider AP").
- `gamestate`: time, estimated gold, owned items for player.

### 5.2 Pipeline
1. **Resolve** every item ID and champion ID to metadata via DDragon maps.
2. **Classify each enemy** into a `ThreatProfile`:
   - static archetype from champion tags + rules (assassin, burst mage, …);
   - **live overrides** from purchased items — e.g. enemy is building >X health →
     mark `health_stacking`; building MR → `mr_stacking`; building lethality →
     amplify "assassin" weight; healing items → `has_sustain`.
3. **Aggregate** the enemy team into threat weights: how much AP vs AD damage
   you face, total hard-CC, presence of a fed assassin, frontline bulk, healing.
4. **Select** from the player's champion build-graph the items whose **intent
   tags** best counter the aggregated threat, honoring power-spike ordering and
   "always core" anchors. Examples of intent tags an item can carry:
   `magic_pen_flat`, `magic_pen_percent`, `burst_amp`, `stasis_survival`,
   `spellshield`, `antiheal`, `percent_hp_damage`, `ability_haste`,
   `armor_self`, `mr_self`, `move_speed`.
5. **Order** into I1→I6 with boots slotted appropriately; produce **situational
   swaps** (a small set of "if the game shifts this way, buy this instead").
6. **Explain** each step with a generated natural-language reason referencing the
   specific enemy/threat that triggered it.
7. **Re-rank continuously**: every poll, if the enemy bought something that
   changes their `ThreatProfile`, recompute and emit `recommendation-updated`.

### 5.3 Two-tier knowledge (how it stays general & current)
- **Tier A — rule-based (ships in v1):** hand-authored intent tags + archetype
  counters. Transparent, explainable, patch-stable. This alone produces good
  recommendations for every champion.
- **Tier B — stats-assisted (v1.1+, optional):** ingest an aggregate
  "matchup → highest-winrate items" table (sourced/imported as data, refreshed
  per patch) to bias ordering toward what's empirically winning. Must respect
  Riot policy (no Arena/Augment win rates; advisory framing). The engine treats
  this as a **prior that nudges** the rule-based result, never as a black box.

### 5.4 Determinism & testing
- Engine is pure (no clock, no network, no randomness): given the same inputs it
  returns the same output. Test with a corpus of fixture `GameState`s (the Ahri
  swap table from the design conversation becomes one fixture set; add several
  more champions/archetypes). Snapshot-test the explained output.

---

## 6. UX / UI Specification

### 6.1 Principles
Modern, smooth, restrained. Glanceable in <2 seconds mid-fight. Dark-first
(matches gaming context), light mode supported. No clutter, no ads, no nags.

### 6.2 Tray
- Always-running tray icon with status color (grey = no game, blue = connecting,
  green = in-game/active).
- Menu: Show/Hide window, "Pin on top" toggle, Settings, Check for updates, Quit.
- Left-click toggles the window; the app keeps living in the tray on window close.

### 6.3 Main window — layout
- **Header strip:** your champion (icon + name), game time, connection status.
- **Primary panel — "Build Next":** the ordered path I1→I6 as a horizontal row
  of item cards. The **next recommended purchase is emphasized** (size, glow,
  motion). Owned items appear checked/dimmed. Each card shows item icon, name,
  cost, and a one-line reason; hover/tap expands the full rationale.
- **Enemy threat board:** the five enemies as compact rows — icon, detected
  archetype chip(s), and live signal badges (e.g. "stacking HP", "lethality",
  "healing", "hard CC"). This is *why* the build looks the way it does, made
  visible.
- **Situational swaps strip:** 2–4 "if X then buy Y" suggestions with reasons.
- **Footer:** patch version, "data: Live Client + Data Dragon", last-updated time.

### 6.4 States to design explicitly
- **No game running** (idle): friendly empty state, "Launch a game and I'll start
  coaching." Tray grey.
- **Connecting / loading DDragon:** skeleton loaders, never a blank flash.
- **In game, early (few items):** show core/anchor build + "watching enemy buys."
- **Enemy build shifts:** animate the path change + a subtle toast ("Enemy Zed
  bought Serpent's Fang — added Banshee's Veil").
- **DDragon offline but cached:** works fully; small "offline, using cached patch
  X" note.
- **Error (unexpected):** non-alarming inline message + retry; log to file.

### 6.5 Accessibility & polish
- Keyboard navigable; ARIA via shadcn/Radix; respects `prefers-reduced-motion`;
  min 11px text; color is never the only signal (badges have text + icon).
- 60 fps interactions; transitions ≤200 ms; no layout shift on data updates.

### 6.6 Settings
- Poll interval (2–5 s), theme, always-on-top default, start-on-boot, region/
  locale for DDragon, "recommendation aggressiveness" (rule-only vs stats-biased
  once Tier B exists), reset cache / force patch refresh.

---

## 7. Non-Functional Requirements
- **Footprint:** installed app < 20 MB; idle RAM modest (native webview).
- **Performance:** a poll→recompute→render cycle completes < 50 ms typical.
- **Reliability:** survives game start/stop/restart, alt-tab, client restarts,
  patch changes mid-session; no crashes on malformed/missing API fields.
- **Security:** TLS exception scoped to localhost:2999 only; no secrets; no
  telemetry by default (opt-in only); signed installer.
- **Privacy:** no account data collected; all processing local.
- **Maintainability:** new champ/item/patch = data change only.
- **Offline:** fully functional during games using cached patch data.

---

## 8. Project Structure
```
draftsmith/
├─ CLAUDE.md                    # Claude Code project context (root, lean)
├─ PROJECT_SPEC.md              # this file
├─ README.md
├─ .claude/
│  ├─ agents/                   # subagents (rust-engine, ui-builder, reviewer)
│  ├─ settings.json             # permissions allowlist + hooks
│  └─ commands/                 # custom slash commands (optional)
├─ package.json
├─ vite.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
├─ index.html
├─ src/                         # React + TS frontend
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ types.ts                  # mirrors Rust contract
│  ├─ lib/ (tauri bridge, query client, utils)
│  ├─ store/ (zustand)
│  ├─ hooks/ (useRecommendation, useConnectionStatus)
│  └─ components/ (BuildNext, ItemCard, EnemyThreatBoard, SwapStrip, Tray UI, states)
├─ src-tauri/
│  ├─ Cargo.toml
│  ├─ tauri.conf.json
│  ├─ build.rs
│  ├─ icons/
│  └─ src/
│     ├─ main.rs / lib.rs
│     ├─ commands.rs
│     ├─ tray.rs
│     ├─ live_client/  ddragon/  model/  engine/  rules/  poll/
│     └─ rules/data/ (champion_profiles.json, item_intents.json, counters.json)
└─ .github/workflows/ci.yml
```

---

## 9. Milestones (incremental, each independently verifiable)
1. **M0 — Scaffold:** Tauri v2 + React/TS/Vite/Tailwind/shadcn boots; tray +
   window; dark theme; empty states. *Verify:* app runs, tray works, window
   toggles.
2. **M1 — Data Dragon layer:** version check, fetch, disk cache, ID→meta maps,
   icons. *Verify:* offline run resolves item/champ names + icons from cache.
3. **M2 — Live Client layer:** poller with scoped self-signed cert; typed
   `/allgamedata`; connection-status events; "no game" handling. *Verify:*
   against a **mock local server** serving captured JSON (so it's testable
   without launching LoL), then against a real game.
4. **M3 — Engine (rule-based, generalized):** model types, enemy classification,
   ranking, explanations; unit + snapshot tests incl. the Ahri fixture set and
   ≥3 other archetypes. *Verify:* `cargo test` green; fixtures produce sensible
   explained paths.
5. **M4 — Wire FE↔Rust:** commands/events; `BuildNext`, `EnemyThreatBoard`,
   `SwapStrip`; live re-rank on enemy purchase; animations. *Verify:* full loop
   with mock server shows updating recs.
6. **M5 — Polish & states:** all UX states, settings, toasts, accessibility,
   reduced-motion, error logging. *Verify:* manual UX pass + Vitest.
7. **M6 — Packaging:** signed Windows installer, auto-updater, CI build matrix,
   README. *Verify:* clean install on a fresh Windows boots and runs.
8. **M7 (optional) — Tier B stats bias + more champion data breadth.**

---

## 10. Definition of Done (v1)
- Detects a live game, identifies the player's champion and all enemies, and
  shows an ordered, explained build that updates live as enemies buy items —
  **for any champion**, with no champion hardcoded in engine control flow.
- Runs from the tray; clean modern UI; all states handled; works offline during
  games from cached patch data; refreshes DDragon only on patch change.
- Rust engine fully unit/snapshot tested; CI green; signed installer produced.
- Fully Riot-compliant (advisory, sanctioned data only, no Arena/Augment win
  rates, product registered before public release).
