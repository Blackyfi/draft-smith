# Changelog

All notable changes to DraftSmith are listed here. Newest first.

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
