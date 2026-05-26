# Changelog

All notable changes to DraftSmith are listed here. Newest first.

## 0.1.8

### New features
- **Enemy items, explained** — a new third column lists every item the enemy team has bought, with
  what each one does (from the game's own item text), quick "type" tags (Tank, Anti-heal, Lethality,
  …), a flag when an item is built to blunt *your* damage, and a hint for how to answer it. Each
  enemy on the threat board now also shows their item icons, so you can spot an unfamiliar item and
  look it up on the right.
- **Kill-threat read on every enemy** — each enemy now shows an at-a-glance survivability gauge
  versus your damage, plus an estimated "≈N× <your spell>" count of how many casts of your main nuke
  it takes to kill them from full health (every champion in the roster is covered). It folds in their champion,
  level, and items. It's an estimate — it can't see enemy runes or their current health.
- **Jungle gank alerts** — a big, bright pop-up (with a sound) warns you when the enemy jungler's
  gank window opens: an early-gank warning timed to their champion's clear style, and a heads-up when
  they hit level 6 and their ultimate is online. Turn the alert or its sound off in Settings.

### Improvements
- **Wider, three-column in-game layout** — the in-game page now uses three columns on wide windows
  (build · threats · enemy items) and still collapses to a single column on narrow/overlay windows.

### Fixes
- The "Next" tag on your next item to buy is no longer partly hidden behind the item icon.

## 0.1.7

- **Full Meta core build** — the Meta panel's "Core build" now shows a complete 5–6 item sequence
  instead of just the first three. The most-popular follow-up for each later slot is folded into the
  build path, and the situational list shows the remaining alternatives (no more duplicates).
- **Skill order follows your keys** — the Meta panel's skill order now respects your keyboard
  settings: AZERTY shows A/Z/E/R, and Keyboard (WASD/ZQSD) movement shows your Q on right-click (RMB)
  and W on Shift — matching what you actually press. The next ability to level is highlighted green.
- **Compact build path** — the "Build next" items are smaller and wrap to fit, so the whole build is
  visible at once without scrolling sideways.
- **Reasons at a glance** — each situational swap now shows a short "why" beside the item name, so
  you don't need to hover to see what it counters.
- **Clearer movement setting** — Settings now lists your ability-key layout first, then the movement
  mode below it, with the keyboard option labeled to match your layout (WASD on QWERTY, ZQSD on
  AZERTY, or your custom keys).

## 0.1.6

- **Wider, two-column in-game layout** — the in-game page now grows sideways instead of ever taller:
  build guidance (skill order, the Adapt build, the Meta build) on the left, situational awareness
  (who to focus, enemy threats, situational swaps) on the right. The window opens wider and keeps
  the same comfortable height; on narrow windows it falls back to a single column.
- **Explain-on-hover threat pills** — hover (or focus) any enemy's archetype or live-signal pill
  ("Fed", "Mobility", "Healing", …) to read what it means and how to play around it.
- **Keyboard (WASD) movement mode** — a new Settings option: if you move with WASD, the skill-order
  coach shows your Q on right-click (RMB) and W on Shift to match League's WASD input (E and R keep
  their layout keys).
- **Live skill-order progress** — the Meta panel's skill order now lights up each ability box as you
  spend points, so you can see where you are in your level-ups even if you stray from the suggested
  order.
- **Fix** — switching roles in the Meta panel no longer multiplies the starting Health Potions (they
  could pile up indefinitely); build lists now render correctly when an item appears more than once.

## 0.1.5

- **Meta build panel** — alongside the matchup-aware "Adapt" build, DraftSmith now shows the
  highest win-rate build for your champion and role on the current patch. It's the "what wins on
  average" reference — core items, starting items, situational options with their win rates, and the
  skill order — shown beside the live recommendation so you can weigh "best on average" against
  "best versus *this* enemy team".
- **Role toggle** — switch the Meta build between the roles your champion is played in; it defaults
  to the most-played one.
- **Rank filter** — choose which rank's stats the Meta build reflects (Diamond+ by default) in
  Settings, or hide the panel entirely.

## 0.1.4

- **Settings no longer traps you** — on shorter or smaller windows the Settings panel could center
  off-screen with its close button out of reach, forcing an app restart. The panel now keeps its
  title and close button pinned and scrolls its contents, so you can always get out.
- **Looks intentional at any size** — the layout now centers a comfortable column when the window is
  maximized or stretched, instead of spreading thin edge-to-edge.
- **Taller default window** — the in-game page is taller now that it shows focus targets, so the
  window opens taller to keep the build path, threats, and situational swaps in view without
  scrolling.
- **More compact build cards** — the item build-path cards are about a third shorter, so more of the
  in-game page fits at once (the full item name is still in each card's tooltip).
- **Themed scrollbar** — the in-game scrollbar matches the app's look instead of the default OS bar.

## 0.1.3

- **Skill-order coach** — DraftSmith now tells you which ability to level next, every level. Reads
  your live champion level + ability ranks and follows a per-champion max priority (unlock each
  early, ultimate at 6/11/16). Shows the key + ability name, and highlights "level up now" when a
  point is waiting.
- **Ability-key layout setting** — choose QWERTY (Q/W/E/R), AZERTY (A/Z/E/R), or set custom letters,
  so the coach shows the keys you actually press.
- **Focus targets** — a "who to focus" callout: ranks enemies by how killable and dangerous they
  are, framed for your champion (delete the squishy carry, dive, lock down, or peel).
- **In-app updates** — Settings now shows the app version, whether an update is available, and an
  "Update now" button; the tray's settings icon flags a waiting update.
- **What's new** — read this changelog inside the app from Settings.
- **Fixes** — champions with special names (Kai'Sa, Lee Sin, Wukong, …) now show their portrait and
  proper display name everywhere.

## 0.1.2

- Fixed champion display names getting stuck on the raw id (e.g. "Kaisa" instead of "Kai'Sa").

## 0.1.1

- Fixed missing champion portraits for champions whose internal id differs from their name.
- Show friendly champion display names instead of raw Live Client ids.

## 0.1.0

- First release: live matchup detection, matchup-aware item build path with explanations, enemy
  threat board, situational swaps, system tray, settings, and auto-update support.
