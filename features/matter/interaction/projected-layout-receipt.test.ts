import { describe, expect, it } from "vitest";
import {
  MATERIAL_ADDRESS_ENGAGEMENT_AMOUNT,
  createProjectedLayoutReceipt,
  projectMaterialAddress,
  type ProjectedLayoutBasis,
} from "./projected-layout-receipt";

const BASIS: ProjectedLayoutBasis = {
  addressKey: "node:4:22",
  documentEpoch: 3,
  layoutEpoch: 7,
  nodeId: "node",
  partitionKey: "selection",
  treeId: "tree",
  viewportKey: "0:0:1",
};

const RECEIPT = createProjectedLayoutReceipt({
  basis: BASIS,
  column: { left: 80, top: 80, right: 920, bottom: 220 },
  rects: [
    { x: 600, y: 100, width: 280, height: 20 },
    { x: 120, y: 132, width: 480, height: 20 },
  ],
  textDirection: "ltr",
  writingMode: "horizontal-tb",
})!;

describe("projected layout receipt", () => {
  it("normalizes browser fragments into one immutable client-space line grid", () => {
    expect(RECEIPT).toMatchObject({
      basis: BASIS,
      coordinateSpace: "client-css-px",
      column: { inlineStart: 80, inlineEnd: 920 },
      rows: [
        { blockStart: 100, blockEnd: 120, inlineStart: 600, inlineEnd: 880 },
        { blockStart: 132, blockEnd: 152, inlineStart: 120, inlineEnd: 600 },
      ],
      run: { startRow: 0, startInline: 600, endRow: 1, endInline: 600 },
      textDirection: "ltr",
      metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 10 },
    });
    expect(Object.isFrozen(RECEIPT)).toBe(true);
    expect(Object.isFrozen(RECEIPT.rows)).toBe(true);
  });

  it("keeps amount zero exactly equal to the neutral measured run", () => {
    expect(projectMaterialAddress({
      amount: 0,
      handle: "bottom",
      maximumDepth: 144,
      receipt: RECEIPT,
    })).toMatchObject({
      attachmentProgress: 0,
      direction: "neutral",
      rows: RECEIPT.rows,
      slot: null,
    });
  });

  it("projects lower and upper grips as mirrored flow intervals without layout reads", () => {
    const lower = projectMaterialAddress({
      amount: .5,
      handle: "bottom",
      maximumDepth: 144,
      receipt: RECEIPT,
    })!;
    expect(lower.direction).toBe("selection-then-slot");
    expect(lower.slot).toEqual({ blockStart: 152, blockEnd: 224 });
    expect(lower.rows).toBe(RECEIPT.rows);
    expect(lower.slot?.blockStart).toBe(lower.rows.at(-1)?.blockEnd);

    const upper = projectMaterialAddress({
      amount: .5,
      handle: "top",
      maximumDepth: 144,
      receipt: RECEIPT,
    })!;
    expect(upper.direction).toBe("slot-then-selection");
    expect(upper.slot).toEqual({ blockStart: 100, blockEnd: 172 });
    expect(upper.rows[0]).toMatchObject({ blockStart: 172, blockEnd: 192 });
    expect(upper.rows[1]).toMatchObject({ blockStart: 204, blockEnd: 224 });
    expect(upper.slot?.blockEnd).toBe(upper.rows[0]?.blockStart);
  });

  it("derives engagement from amount so pointer and keyboard geometry cannot diverge", () => {
    const partial = projectMaterialAddress({
      amount: MATERIAL_ADDRESS_ENGAGEMENT_AMOUNT / 2,
      handle: "bottom",
      maximumDepth: 144,
      receipt: RECEIPT,
    })!;
    const keyboardFirstStep = projectMaterialAddress({
      amount: .1,
      handle: "bottom",
      maximumDepth: 144,
      receipt: RECEIPT,
    })!;
    expect(partial.attachmentProgress).toBe(.5);
    expect(keyboardFirstStep.attachmentProgress).toBe(1);
  });

  it("fails closed for unsupported writing modes and malformed geometry", () => {
    expect(createProjectedLayoutReceipt({
      basis: BASIS,
      column: { left: 0, top: 0, right: 100, bottom: 100 },
      rects: [{ x: 0, y: 0, width: 20, height: 20 }],
      textDirection: "ltr",
      writingMode: "vertical-rl",
    })).toBeNull();
    expect(createProjectedLayoutReceipt({
      basis: BASIS,
      column: { left: 0, top: 0, right: 0, bottom: 100 },
      rects: [{ x: 0, y: 0, width: 20, height: 20 }],
      textDirection: "ltr",
      writingMode: "horizontal-tb",
    })).toBeNull();
  });

  it("keeps logical range endpoints for right-to-left material", () => {
    expect(createProjectedLayoutReceipt({
      basis: BASIS,
      column: { left: 80, top: 80, right: 920, bottom: 220 },
      rects: [
        { x: 600, y: 100, width: 280, height: 20 },
        { x: 120, y: 132, width: 480, height: 20 },
      ],
      textDirection: "rtl",
      writingMode: "horizontal-tb",
    })).toMatchObject({
      run: { startInline: 880, endInline: 120 },
      textDirection: "rtl",
    });
  });
});
