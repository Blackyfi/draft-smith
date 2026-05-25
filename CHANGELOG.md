# Changelog

All notable changes to DraftSmith are listed here. Newest first.

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
