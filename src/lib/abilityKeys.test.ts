import { describe, expect, it } from "vitest";

import { slotToKey, slotToKeyAria } from "@/lib/abilityKeys";
import type { AbilityKeys } from "@/types";

const QWERTY: AbilityKeys = {
  layout: "qwerty",
  custom: ["1", "2", "3", "4"],
  movementMode: "mouse",
};
const AZERTY: AbilityKeys = {
  layout: "azerty",
  custom: ["1", "2", "3", "4"],
  movementMode: "mouse",
};
const CUSTOM: AbilityKeys = {
  layout: "custom",
  custom: ["Z", "X", "C", "V"],
  movementMode: "mouse",
};

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

  describe("keyboard (WASD) movement mode", () => {
    // Q → right-click, W → Shift; E/R keep their layout keys (same physical keys on AZERTY too).
    const QWERTY_WASD: AbilityKeys = { ...QWERTY, movementMode: "keyboard" };
    const AZERTY_WASD: AbilityKeys = { ...AZERTY, movementMode: "keyboard" };
    const CUSTOM_WASD: AbilityKeys = { ...CUSTOM, movementMode: "keyboard" };

    it("maps Q → RMB", () => expect(slotToKey("Q", QWERTY_WASD)).toBe("RMB"));
    it("maps W → Shift", () =>
      expect(slotToKey("W", QWERTY_WASD)).toBe("Shift"));
    it("keeps E on the layout key", () =>
      expect(slotToKey("E", QWERTY_WASD)).toBe("E"));
    it("keeps R on the layout key", () =>
      expect(slotToKey("R", QWERTY_WASD)).toBe("R"));

    it("Q→RMB and W→Shift regardless of azerty layout", () => {
      expect(slotToKey("Q", AZERTY_WASD)).toBe("RMB");
      expect(slotToKey("W", AZERTY_WASD)).toBe("Shift");
      expect(slotToKey("E", AZERTY_WASD)).toBe("E");
    });

    it("E/R still respect a custom layout under WASD", () => {
      expect(slotToKey("Q", CUSTOM_WASD)).toBe("RMB");
      expect(slotToKey("E", CUSTOM_WASD)).toBe("C");
      expect(slotToKey("R", CUSTOM_WASD)).toBe("V");
    });
  });

  describe("slotToKeyAria", () => {
    it("returns the letter for mouse movement", () =>
      expect(slotToKeyAria("Q", QWERTY)).toBe("Q"));
    it("spells out the right mouse button under WASD", () =>
      expect(slotToKeyAria("Q", { ...QWERTY, movementMode: "keyboard" })).toBe(
        "Right mouse button",
      ));
    it("spells out Left Shift under WASD", () =>
      expect(slotToKeyAria("W", { ...QWERTY, movementMode: "keyboard" })).toBe(
        "Left Shift",
      ));
  });
});
