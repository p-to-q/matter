import { describe, expect, it } from "vitest";
import {
  beginMaterialAddressConfirmation,
  createMaterialAddressConfirmationBasis,
  finishesMaterialAddressConfirmation,
  moveMaterialAddressConfirmation,
} from "./material-address-confirmation";
import type { MaterialAddressProjection } from "./projected-layout-receipt";

const PROJECTION = Object.freeze({
  attachmentProgress: 1,
  basis: Object.freeze({
    addressKey: "thought_1:0:8",
    documentEpoch: 2,
    layoutEpoch: 3,
    nodeId: "thought_1",
    partitionKey: "selection:selection-then-slot",
    treeId: "tree_1",
    viewportKey: "0:0:1",
  }),
  column: Object.freeze({ blockEnd: 40, blockStart: 0, inlineEnd: 100, inlineStart: 0 }),
  coordinateSpace: "client-css-px" as const,
  direction: "selection-then-slot" as const,
  metrics: Object.freeze({ blockOutset: 3, cornerRadius: 3, inlineOutset: 6, medianRowExtent: 20 }),
  rows: Object.freeze([Object.freeze({ blockEnd: 20, blockStart: 0, inlineEnd: 80, inlineStart: 10 })]),
  run: Object.freeze({ endInline: 80, endRow: 0, startInline: 10, startRow: 0 }),
  slot: Object.freeze({ blockEnd: 40, blockStart: 20 }),
  textDirection: "ltr" as const,
  writingMode: "horizontal-tb" as const,
}) satisfies MaterialAddressProjection;

const BASIS = createMaterialAddressConfirmationBasis(PROJECTION, "M0 0Z");

function pointer(overrides: Partial<{
  button: number;
  clientX: number;
  clientY: number;
  isPrimary: boolean;
  pointerId: number;
  pointerType: string;
}> = {}) {
  return {
    button: 0,
    clientX: 20,
    clientY: 20,
    isPrimary: true,
    pointerId: 7,
    pointerType: "mouse",
    ...overrides,
  };
}

describe("material address confirmation", () => {
  it("accepts one stationary primary tap on the unchanged rendered address", () => {
    const press = beginMaterialAddressConfirmation(BASIS, pointer());
    expect(press).not.toBeNull();
    expect(finishesMaterialAddressConfirmation(
      press!,
      BASIS,
      pointer({ clientX: 23, clientY: 22 }),
      true,
      "M0 0Z",
    )).toBe(true);
  });

  it("rejects coalesced movement even when the pointer returns inside before release", () => {
    const press = beginMaterialAddressConfirmation(BASIS, pointer());
    const moved = moveMaterialAddressConfirmation(press!, pointer({ clientX: 25 }));
    expect(moved.cancelled).toBe(true);
    expect(finishesMaterialAddressConfirmation(moved, BASIS, pointer(), true, "M0 0Z")).toBe(false);

    const touch = beginMaterialAddressConfirmation(BASIS, pointer({ pointerType: "touch" }));
    expect(moveMaterialAddressConfirmation(touch!, pointer({ clientX: 28 })).cancelled).toBe(false);
    expect(moveMaterialAddressConfirmation(touch!, pointer({ clientX: 29 })).cancelled).toBe(true);
  });

  it("fails closed for another pointer, an outside release, or changed address geometry", () => {
    const press = beginMaterialAddressConfirmation(BASIS, pointer());
    expect(finishesMaterialAddressConfirmation(
      press!, BASIS, pointer({ pointerId: 8 }), true, "M0 0Z",
    )).toBe(false);
    expect(finishesMaterialAddressConfirmation(press!, BASIS, pointer(), false, "M0 0Z"))
      .toBe(false);
    expect(finishesMaterialAddressConfirmation(press!, BASIS, pointer(), true, "M1 1Z"))
      .toBe(false);
    expect(finishesMaterialAddressConfirmation(
      press!,
      createMaterialAddressConfirmationBasis(PROJECTION, "M1 1Z"),
      pointer(),
      true,
      "M1 1Z",
    )).toBe(false);
  });

  it("does not give confirmation authority to secondary or damaged pointers", () => {
    expect(beginMaterialAddressConfirmation(BASIS, pointer({ isPrimary: false }))).toBeNull();
    expect(beginMaterialAddressConfirmation(BASIS, pointer({ button: 2 }))).toBeNull();
    expect(beginMaterialAddressConfirmation(BASIS, pointer({ clientX: Number.NaN }))).toBeNull();
    expect(beginMaterialAddressConfirmation(BASIS, pointer({ pointerType: "unknown" }))).toBeNull();
  });
});
