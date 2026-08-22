import { describe, expect, it } from "vitest";
import type { TypographyHeightSnapshot } from "../components/typography-height-authority";
import type { TypographyHeightAuthorityToken } from "./typography-height-ledger";
import {
  publishCompleteLayout,
  type CompleteLayoutConfig,
  type CompleteLayoutProjectionItem,
  type CompleteTypographyHeightSnapshot,
} from "./complete-layout-publication";

const BASIS: TypographyHeightAuthorityToken = Object.freeze({
  authorityGeneration: 5,
  documentEpoch: 2,
  fontEpoch: 3,
  grammarEpoch: 4,
  projectionKey: "tree:9:full::",
  styleEpoch: 6,
});

const CONFIG: CompleteLayoutConfig = Object.freeze({
  columnGap: 40,
  columnWidth: 200,
  layoutEpoch: 8,
  origin: Object.freeze({ x: 10, y: 20 }),
  siblingGap: 16,
});

const PROJECTION: readonly CompleteLayoutProjectionItem[] = Object.freeze([
  Object.freeze({ depth: 0, node: Object.freeze({ id: "root" }), parentId: null }),
  Object.freeze({ depth: 1, node: Object.freeze({ id: "first" }), parentId: "root" }),
  Object.freeze({ depth: 1, node: Object.freeze({ id: "second" }), parentId: "root" }),
]);

function snapshot(
  override: Partial<CompleteTypographyHeightSnapshot> = {},
): CompleteTypographyHeightSnapshot {
  return Object.freeze({
    basis: BASIS,
    heights: Object.freeze([80, 30, 40]),
    // Equal cache keys are valid when two different nodes share exact text and
    // typography; nodeIds, rather than cache identity, bind authored order.
    keys: Object.freeze(["root-key", "shared-key", "shared-key"]),
    nodeIds: Object.freeze(["root", "first", "second"]),
    ...override,
  });
}

function publish(input: Readonly<{
  expectedBasis?: TypographyHeightAuthorityToken;
  layout?: CompleteLayoutConfig;
  projection?: readonly CompleteLayoutProjectionItem[];
  snapshot?: CompleteTypographyHeightSnapshot;
}> = {}) {
  return publishCompleteLayout({
    expectedBasis: input.expectedBasis ?? BASIS,
    layout: input.layout ?? CONFIG,
    projection: input.projection ?? PROJECTION,
    snapshot: input.snapshot ?? snapshot(),
  });
}

describe("publishCompleteLayout", () => {
  it("publishes one complete immutable layout in authored snapshot order", () => {
    const result = publish();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);

    expect(result.publication.nodeIds).toEqual(["root", "first", "second"]);
    expect(result.publication.layout.boxes.map(({ nodeId, height }) => ({ nodeId, height })))
      .toEqual([
        { nodeId: "root", height: 80 },
        { nodeId: "first", height: 30 },
        { nodeId: "second", height: 40 },
      ]);
    expect(result.publication.layout.layoutEpoch).toBe(8);
    expect(result.publication.basis).toEqual(BASIS);
    expect(result.publication.basis).toBe(BASIS);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.publication)).toBe(true);
    expect(Object.isFrozen(result.publication.basis)).toBe(true);
    expect(Object.isFrozen(result.publication.nodeIds)).toBe(true);
    expect(Object.isFrozen(result.publication.layout)).toBe(true);
    expect(Object.isFrozen(result.publication.layout.boxes)).toBe(true);
  });

  it("accepts an exact empty projection as one complete publication", () => {
    const result = publish({
      projection: Object.freeze([]),
      snapshot: snapshot({
        heights: Object.freeze([]),
        keys: Object.freeze([]),
        nodeIds: Object.freeze([]),
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      publication: {
        layout: { boxes: [], edges: [] },
        nodeIds: [],
      },
    });
  });

  it("accepts the C1 authority snapshot contract without adaptation", () => {
    const measured: TypographyHeightSnapshot = snapshot();
    expect(publish({ snapshot: measured }).ok).toBe(true);
  });

  it("requires the exact owner-issued basis capability, not equal copied counters", () => {
    const copied = Object.freeze({ ...BASIS });
    expect(publish({ expectedBasis: copied })).toEqual({
      ok: false,
      error: { code: "STALE_HEIGHT_BASIS" },
    });
    expect(publish({
      snapshot: snapshot({ basis: Object.freeze({ ...BASIS, fontEpoch: 4 }) }),
    })).toEqual({
      ok: false,
      error: { code: "STALE_HEIGHT_BASIS" },
    });
    expect(publish({
      expectedBasis: Object.freeze({ ...BASIS, grammarEpoch: -1 }),
    })).toEqual({
      ok: false,
      error: { code: "INVALID_HEIGHT_BASIS" },
    });
    expect(publish({
      expectedBasis: { ...BASIS },
      snapshot: snapshot({ basis: { ...BASIS } }),
    })).toEqual({
      ok: false,
      error: { code: "INVALID_HEIGHT_BASIS" },
    });
  });

  it.each([
    ["missing height", snapshot({ heights: Object.freeze([80, 30]) })],
    ["missing key", snapshot({ keys: Object.freeze(["root-key", "shared-key"]) })],
    ["missing node id", snapshot({ nodeIds: Object.freeze(["root", "first"]) })],
  ])("rejects an incomplete transaction: %s", (_label, incomplete) => {
    expect(publish({ snapshot: incomplete })).toEqual({
      ok: false,
      error: { code: "INCOMPLETE_HEIGHT_SNAPSHOT" },
    });
  });

  it.each([
    [0],
    [-1],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
  ])("rejects a non-positive or non-finite height atomically: %s", (height) => {
    const result = publish({
      snapshot: snapshot({ heights: Object.freeze([80, height, 40]) }),
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_HEIGHT", index: 1, nodeId: "first" },
    });
    expect("publication" in result).toBe(false);
  });

  it("rejects empty keys but preserves legitimate repeated cache keys", () => {
    expect(publish().ok).toBe(true);
    expect(publish({
      snapshot: snapshot({ keys: Object.freeze(["root-key", "", "shared-key"]) }),
    })).toEqual({
      ok: false,
      error: { code: "INVALID_HEIGHT_KEY", index: 1, nodeId: "first" },
    });
  });

  it("rejects duplicate or reordered node identity before layout", () => {
    expect(publish({
      snapshot: snapshot({ nodeIds: Object.freeze(["root", "first", "first"]) }),
    })).toEqual({
      ok: false,
      error: { code: "DUPLICATE_SNAPSHOT_NODE_ID", index: 2, nodeId: "first" },
    });
    expect(publish({
      snapshot: snapshot({ nodeIds: Object.freeze(["root", "second", "first"]) }),
    })).toEqual({
      ok: false,
      error: { code: "HEIGHT_NODE_ORDER_MISMATCH", index: 1, nodeId: "second" },
    });
    const duplicateProjection = Object.freeze([
      PROJECTION[0]!,
      PROJECTION[1]!,
      Object.freeze({ ...PROJECTION[2]!, node: Object.freeze({ id: "first" }) }),
    ]);
    expect(publish({ projection: duplicateProjection })).toEqual({
      ok: false,
      error: { code: "DUPLICATE_PROJECTION_NODE_ID", index: 2, nodeId: "first" },
    });
  });

  it("returns the existing pure layout failure without publishing a prefix", () => {
    const result = publish({
      layout: Object.freeze({ ...CONFIG, columnWidth: 0 }),
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "LAYOUT_REJECTED",
        layoutError: { code: "INVALID_COLUMN_WIDTH" },
      },
    });
    expect("publication" in result).toBe(false);
  });

  it("does not mutate frozen projection, snapshot, or layout inputs", () => {
    const measured = snapshot();
    const before = JSON.stringify({ config: CONFIG, projection: PROJECTION, snapshot: measured });
    expect(publish({ snapshot: measured }).ok).toBe(true);
    expect(JSON.stringify({ config: CONFIG, projection: PROJECTION, snapshot: measured })).toBe(before);
  });
});
