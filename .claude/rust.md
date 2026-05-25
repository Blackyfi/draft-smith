# Rust conventions (`src-tauri/`)

## The data-driven invariant (most important rule)
The recommendation engine in `engine/` is a **pure function of its inputs**. Champion, item, and
patch behavior comes from `rules/data/*.json`, never from code:

- **Forbidden in `engine/`:** matching on a specific champion/item *name or ID* to alter logic
  (`if champ == "Ahri"`, `match item_id { 3157 => ... }`). The engine reasons over **abstract
  attributes** — `DamageType`, `Archetype`, intent-tags (`magic_pen_percent`, `antiheal`,
  `stasis_survival`, …), and live signals (`health_stacking`, `has_sustain`).
- **Allowed:** matching on those abstract enums/tags. Adding "Ahri" or "Zhonya's" is editing JSON.
- Every engine PR/plan states a **data-driven check**: "no champion/item special-casing leaked in."

## Purity & testing
- `engine/` does **no I/O, no `SystemTime::now()`, no RNG**. Pass time/gold in via `GameState`.
- Snapshot the explained output with **insta**. Fixtures live with the engine; corpus must include
  the **Ahri fixture set + ≥3 other archetypes** (e.g. an AD assassin lane, a tanky frontline comp,
  a heavy-healing comp). Review snapshots with `cargo insta review` — never blind-accept.
- Resolver/DDragon/live_client may do I/O, but keep it out of `engine/`.

## TLS / Live Client
- One reqwest client for the local endpoint with the cert exception; a **separate** ordinary client
  for DDragon. The exception must be unreachable for any host other than `127.0.0.1:2999`.
- Connection-refused outside a game ⇒ `no-game` status, not a logged error.

## Style
- Idiomatic Rust; **clippy-clean** (`cargo clippy --all-targets -- -D warnings`), `cargo fmt` before commit.
- Model fallibility with `Result` + a domain error enum (`thiserror`); never `unwrap()` on external
  data (live API / DDragon / disk). Deserialize defensively — partial/missing fields must not panic.
- Tauri command/event payloads are the typed contract; mirror them in `src/types.ts`.
