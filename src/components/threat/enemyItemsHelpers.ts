import type { EnemyThreatView, ItemIntel } from "@/types";

/**
 * Builds the ordered list of item ids to display in the Enemy Items panel:
 *
 * 1. Walks `threats[].items` in threat-row order (first enemy first, slot order within each row)
 *    and collects ids in first-seen order, deduplicating across all enemies.
 * 2. For each collected id, looks up `ItemIntel` from `enemyItems` by id.
 * 3. Sorts: items with `countersYou === true` float to the top; within each group the original
 *    first-seen order is preserved (stable sort).
 *
 * Items whose id has no matching `ItemIntel` are still listed (icon + DDragon name only, no pills
 * or counter info), so nothing in the enemy inventory silently disappears.
 *
 * Pure function — no side effects, fully unit-testable without React.
 */
export function buildEnemyItemList(
  threats: EnemyThreatView[],
  enemyItems: ItemIntel[],
): Array<{ id: number; intel: ItemIntel | undefined }> {
  // 1. Collect unique ids, first-seen order.
  const seen = new Set<number>();
  const orderedIds: number[] = [];
  for (const threat of threats) {
    for (const id of threat.items) {
      if (!seen.has(id)) {
        seen.add(id);
        orderedIds.push(id);
      }
    }
  }

  // 2. Pair each id with its intel (may be undefined for unmapped items).
  const intelById = new Map(enemyItems.map((e) => [e.id, e]));
  const pairs = orderedIds.map((id) => ({ id, intel: intelById.get(id) }));

  // 3. Stable sort: countersYou items first.
  return pairs.sort((a, b) => {
    const aC = a.intel?.countersYou ? 0 : 1;
    const bC = b.intel?.countersYou ? 0 : 1;
    return aC - bC;
  });
}

/**
 * Compact display labels for DDragon stat names, so the per-item stat line stays short enough to
 * scan at a glance (e.g. "Ability Haste" → "Haste", "Health" → "HP"). Unmapped labels pass through
 * unchanged. Keyed on the exact DDragon label; case-sensitive by design (DDragon is consistent).
 */
const STAT_LABEL_ABBREVIATIONS: Record<string, string> = {
  Health: "HP",
  "Move Speed": "MS",
  "Movement Speed": "MS",
  "Ability Haste": "Haste",
  "Magic Penetration": "Magic Pen",
  "Armor Penetration": "Armor Pen",
  "Attack Damage": "AD",
  "Ability Power": "AP",
  "Attack Speed": "Atk Speed",
  "Critical Strike Chance": "Crit",
  "Magic Resist": "MR",
  "Magic Resistance": "MR",
  "Life Steal": "Lifesteal",
  "Heal and Shield Power": "Heal/Shield",
  "Base Health Regen": "HP Regen",
  "Base Mana Regen": "Mana Regen",
};

/** Returns the compact display form of a DDragon stat label, or the label itself when unmapped. */
export function abbreviateStatLabel(label: string): string {
  return STAT_LABEL_ABBREVIATIONS[label] ?? label;
}
