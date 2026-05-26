import type { AbilityKeys, AbilitySlot } from "@/types";

/** Index of each slot in the custom array and the default layouts. */
const SLOT_INDEX: Record<AbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3 };

const QWERTY_KEYS: [string, string, string, string] = ["Q", "W", "E", "R"];
const AZERTY_KEYS: [string, string, string, string] = ["A", "Z", "E", "R"];

/** Short badge label + accessible name for the Q/W slots in Keyboard (WASD) movement mode. */
const KEYBOARD_OVERRIDE: Partial<
  Record<AbilitySlot, { key: string; aria: string }>
> = {
  Q: { key: "RMB", aria: "Right mouse button" },
  W: { key: "Shift", aria: "Left Shift" },
};

/**
 * The slot's plain layout letter (Q W E R / A Z E R / custom), ignoring movement mode. Use this for
 * places that name the *ability identity* (e.g. the "Max Q>W>E" priority) rather than the key you
 * physically press — where the WASD-mode "RMB"/"Shift" overrides would be unreadable.
 */
export function slotToLayoutKey(
  slot: AbilitySlot,
  abilityKeys: AbilityKeys,
): string {
  return layoutKey(slot, abilityKeys);
}

/** Resolves a slot to its layout letter (Q W E R / A Z E R / custom). */
function layoutKey(slot: AbilitySlot, abilityKeys: AbilityKeys): string {
  const idx = SLOT_INDEX[slot];
  switch (abilityKeys.layout) {
    case "qwerty":
      return QWERTY_KEYS[idx];
    case "azerty":
      return AZERTY_KEYS[idx];
    case "custom":
      // `||` (not `??`) so a blank custom entry ("" — e.g. the user cleared the input) falls back to
      // the default letter rather than rendering an empty badge.
      return abilityKeys.custom[idx] || QWERTY_KEYS[idx];
  }
}

/**
 * Maps an `AbilitySlot` to the displayed key label given the player's keybind settings.
 *
 * - `movementMode === "keyboard"` (League's WASD input): Q → `RMB` (right-click), W → `Shift`;
 *   E and R keep their layout letters (the same physical keys, incl. on AZERTY).
 * - otherwise: the layout letter — `qwerty` → Q/W/E/R, `azerty` → A/Z/E/R, `custom` → custom entry.
 */
export function slotToKey(slot: AbilitySlot, abilityKeys: AbilityKeys): string {
  if (abilityKeys.movementMode === "keyboard") {
    const override = KEYBOARD_OVERRIDE[slot];
    if (override) return override.key;
  }
  return layoutKey(slot, abilityKeys);
}

/**
 * Accessible name for a slot's key — spells out the WASD overrides ("Right mouse button",
 * "Left Shift") so the skill-coach badge reads clearly to screen readers.
 */
export function slotToKeyAria(
  slot: AbilitySlot,
  abilityKeys: AbilityKeys,
): string {
  if (abilityKeys.movementMode === "keyboard") {
    const override = KEYBOARD_OVERRIDE[slot];
    if (override) return override.aria;
  }
  return layoutKey(slot, abilityKeys);
}
