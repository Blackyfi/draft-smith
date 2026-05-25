# Claude Code Kickoff Prompt — DraftSmith

> Paste everything in the **"PROMPT TO PASTE"** block below into Claude Code as
> your first message, with `PROJECT_SPEC.md` present in the (empty) project
> directory. The sections above it explain *why* the prompt is shaped this way so
> you can adapt it. This is engineered around current (2026) Claude Code features:
> `/init` + CLAUDE.md as infrastructure, **Plan Mode** as an approval gate,
> **subagents** for isolated work, **hooks** for deterministic guarantees, a
> **permissions allowlist**, the **thinking-budget** keywords, and
> **verify-every-milestone** discipline.

---

## Why the prompt is built this way (read once, then skip)

- **CLAUDE.md is the highest-leverage artifact.** Claude Code reads it at the
  start of every session; it's persistent context for build commands, stack
  rules, and gotchas. Keep the root file lean (~50–100 lines) and `@import`
  detail. The prompt's first job is to generate a great one.
- **Plan Mode before code.** For anything where being wrong is expensive
  (architecture, the engine, the FE↔Rust contract), make Claude produce a plan
  and **wait for your approval** before editing. This is the single biggest
  quality lever — it bounds exploration and lets your judgment intervene before
  code exists.
- **Subagents keep context clean.** Use the read-only **Explore** agent for
  codebase/API investigation, and define project subagents (a Rust-engine
  specialist, a UI builder, a reviewer) so deep work runs in isolated context
  windows and only summaries return to the main session.
- **Hooks are deterministic, CLAUDE.md is advisory.** Put "must always happen"
  actions (run clippy/eslint/tests after edits, block dangerous commands) in
  hooks, not prose.
- **Permissions allowlist** pre-approves the safe commands you'll always allow
  (test/lint/build/git) so you aren't approving each one.
- **Thinking budget:** say **"think hard"** on architecture/engine design;
  reserve **"ultrathink"** for the one or two hardest design decisions.
- **Milestones with verification.** Build M0→M7 from the spec; each milestone
  ends with a concrete verification step. Use a **mock Live Client server** so
  everything is testable without launching League.
- **/clear between milestones** to avoid context rot; re-anchor on CLAUDE.md.

---

## PROMPT TO PASTE  ⬇️ (copy from here to the end)

We are building **DraftSmith**, a production-grade desktop app. The complete,
authoritative specification is in `PROJECT_SPEC.md` in this directory. **Read it
fully before doing anything else** — it defines the goal, the generalized
(all-champions, data-driven) recommendation engine, the exact tech stack, the
architecture, the UX, and an 8-milestone plan (M0–M7) with verification criteria.
Treat the spec as the source of truth; if anything I say conflicts with it, ask
me before proceeding.

**Operating agreement for this whole project — follow exactly:**

1. **Set up project context first.** Run `/init`, then write a lean root
   `CLAUDE.md` (~50–100 lines) capturing: the one-line goal, the exact stack and
   versions, the **non-negotiable constraints** (Riot-sanctioned data ONLY — Live
   Client API + Data Dragon; the self-signed-cert exception must be scoped to
   `127.0.0.1:2999` only; advisory-only, never auto-acts; **no champion hardcoded
   in engine control flow — the engine is data-driven**; no Arena/Augment win
   rates), the build/test/lint commands, and the key gotchas. Put detailed
   conventions in `@import`ed files (e.g. `.claude/rust.md`, `.claude/frontend.md`)
   rather than bloating the root. For each line ask "would removing this cause a
   mistake?" — if not, cut it.

2. **Establish guardrails before building:**
   - Create a **permissions allowlist** (`/permissions` → `.claude/settings.json`)
     pre-approving: the test commands (`cargo test`, `npm run test`), lint/format
     (`cargo clippy`, `cargo fmt`, `npm run lint`), the dev/build commands
     (`npm run tauri dev`, `npm run tauri build`), and `git add/commit`.
   - Add **hooks** in `.claude/settings.json`: a **PostToolUse** hook that runs
     the relevant formatter+linter after Rust or TS edits, and a **PreToolUse**
     hook that blocks destructive commands (`rm -rf`, force-push). Hooks are
     deterministic — use them for things that must always happen.
   - Define project **subagents** in `.claude/agents/`: (a) `rust-engine` —
     specialist for the recommendation engine and Rust core, tools limited to
     Read/Edit/Bash, model strong; (b) `ui-builder` — React/Tailwind/shadcn
     specialist; (c) `code-reviewer` — read-only (Read/Glob/Grep), invoked after
     each milestone to review correctness, the data-driven invariant, error
     handling, and Riot-compliance. Use the read-only **Explore** agent for any
     API/library investigation so it doesn't pollute the main context.

3. **Work milestone by milestone (M0→M7 from the spec). For each milestone:**
   - **Enter Plan Mode first.** Produce a structured plan: files to create/change,
     the FE↔Rust contract touched, test/verification approach, and risks. Each
     plan must include a **"verification"** section and a **"data-driven check"**
     section confirming no champion-specific branching leaked into the engine.
     **Stop and wait for my approval. Do not edit files until I approve.**
   - On approval, implement. Prefer the relevant subagent for isolated work.
   - **Verify before declaring done**, exactly as the spec's milestone says
     (e.g. M2/M4 must work against a **mock local server** serving captured
     `/allgamedata` JSON so we can test without launching League; M3 must have
     `cargo test` green including the **Ahri fixture set plus ≥3 other
     archetypes**). If you can't verify it, it isn't done.
   - Invoke `code-reviewer`, address findings, then `git commit` with a clear
     message. Tell me to `/clear` before the next milestone and what to re-read.

4. **Thinking budget:** **think hard** when planning the architecture (M0), the
   recommendation engine design (M3), and the FE↔Rust typed contract (M4). Use
   **ultrathink** specifically for designing the generalized engine's data model
   and intent-tag system in M3 — getting the abstraction right is what makes the
   whole product general rather than an Ahri tool. For routine wiring, normal
   effort is fine.

5. **Guard the core invariant relentlessly:** the recommendation engine must be a
   **pure, data-driven function** — adding a champion/item/patch is a *data*
   change, never an engine code change. Champion behavior comes from
   `rules/data/*.json` (champion profiles, item intent tags, archetype→counter
   mappings), not from `match champion_name { ... }`. If you ever find yourself
   special-casing a champion in engine logic, stop and move it to data. Call this
   out in every plan.

6. **Quality bars:** TypeScript strict; Rust idiomatic and clippy-clean; the
   engine pure and snapshot-tested; the Live Client TLS exception scoped to
   localhost only; all UX states from the spec implemented (no-game, loading,
   in-game, enemy-build-shift, offline-cached, error); `prefers-reduced-motion`
   respected; never hardcode the patch version (discover via DDragon
   `versions.json`); never fetch DDragon during a game (cache to disk, refresh
   only on patch change).

**Start now with step 1 (read `PROJECT_SPEC.md`, then `/init` and the CLAUDE.md +
guardrails), then present the M0 plan in Plan Mode and wait for my approval.** Do
not write application code until I approve the M0 plan.

## ⬆️ (end of prompt to paste)

---

## How to drive it after the first message (quick operator notes)
- When a plan appears, actually read it. Approve, or push back ("the engine plan
  hardcodes archetypes — move them to data"). The plan gate is where your
  leverage is.
- Between milestones: `/clear`, then a one-liner — *"Re-read CLAUDE.md and
  PROJECT_SPEC.md §<n>. Plan M<n> in Plan Mode and wait for approval."*
- If it over-explores, interrupt: *"Use the Explore subagent for that, then come
  back with a plan."*
- When you get to M2/real testing, you'll need a captured `/allgamedata` sample.
  Ask it to *"generate a realistic mock `/allgamedata` fixture and a tiny local
  mock server"* so you can develop the whole loop without being in a live game.
- Periodically: *"Run code-reviewer on the last milestone and confirm the
  data-driven invariant still holds."*
- Compact proactively around 70% context; start fresh sessions per milestone.
