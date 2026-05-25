import type { AbilityKeys, AbilitySlot } from "@/types";

/** Index of each slot in the custom array and the default layouts. */
const SLOT_INDEX: Record<AbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3 };

const QWERTY_KEYS: [string, string, string, string] = ["Q", "W", "E", "R"];
const AZERTY_KEYS: [string, string, string, string] = ["A", "Z", "E", "R"];

/**
 * Maps an `AbilitySlot` to the displayed key letter given the player's keybind settings.
 *
 * - `qwerty` → Q / W / E / R
 * - `azerty` → A / Z / E / R
 * - `custom` → the corresponding entry from `abilityKeys.custom`
 */
export function slotToKey(slot: AbilitySlot, abilityKeys: AbilityKeys): string {
  const idx = SLOT_INDEX[slot];
  switch (abilityKeys.layout) {
    case "qwerty":
      return QWERTY_KEYS[idx];
    case "azerty":
      return AZERTY_KEYS[idx];
    case "custom":
      return abilityKeys.custom[idx] ?? QWERTY_KEYS[idx];
  }
}
