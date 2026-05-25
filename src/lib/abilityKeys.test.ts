import { describe, expect, it } from "vitest";

import { slotToKey } from "@/lib/abilityKeys";
import type { AbilityKeys } from "@/types";

const QWERTY: AbilityKeys = { layout: "qwerty", custom: ["1", "2", "3", "4"] };
const AZERTY: AbilityKeys = { layout: "azerty", custom: ["1", "2", "3", "4"] };
const CUSTOM: AbilityKeys = { layout: "custom", custom: ["Z", "X", "C", "V"] };

describe("slotToKey", () => {
  describe("qwerty layout", () => {
    it("maps Q → Q", () => expect(slotToKey("Q", QWERTY)).toBe("Q"));
    it("maps W → W", () => expect(slotToKey("W", QWERTY)).toBe("W"));
    it("maps E → E", () => expect(slotToKey("E", QWERTY)).toBe("E"));
    it("maps R → R", () => expect(slotToKey("R", QWERTY)).toBe("R"));
  });

  describe("azerty layout", () => {
    it("maps Q → A", () => expect(slotToKey("Q", AZERTY)).toBe("A"));
    it("maps W → Z", () => expect(slotToKey("W", AZERTY)).toBe("Z"));
    it("maps E → E", () => expect(slotToKey("E", AZERTY)).toBe("E"));
    it("maps R → R", () => expect(slotToKey("R", AZERTY)).toBe("R"));
  });

  describe("custom layout", () => {
    it("maps Q → custom[0]", () => expect(slotToKey("Q", CUSTOM)).toBe("Z"));
    it("maps W → custom[1]", () => expect(slotToKey("W", CUSTOM)).toBe("X"));
    it("maps E → custom[2]", () => expect(slotToKey("E", CUSTOM)).toBe("C"));
    it("maps R → custom[3]", () => expect(slotToKey("R", CUSTOM)).toBe("V"));
  });
});
