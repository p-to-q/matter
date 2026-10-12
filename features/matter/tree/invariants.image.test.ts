import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_POINTER_BYTES,
  MAX_TREE_IMAGE_BYTES,
  MAX_TREE_IMAGE_NODES,
  type ImagePointer,
} from "./image-pointer";
import { createEmptyTree, treeCanTakePicture, validateThoughtTree } from "./invariants";
import type { ThoughtNode, ThoughtTree } from "./model";

const STAMP = "2026-10-12T00:00:00.000Z";
const PNG: ImagePointer = {
  mediaType: "image/png",
  byteLength: 1_000,
  width: 512,
  height: 512,
  contentHash: "ab".repeat(32),
};
const hashOf = (index: number) => index.toString(16).padStart(64, "0");

function passage(id: string, image?: ImagePointer): ThoughtNode {
  return {
    id,
    text: id,
    parentId: "doc",
    children: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...(image === undefined ? {} : { image }),
  };
}

/** A document with one passage per entry; `null` is a passage without a picture. */
function document(images: ReadonlyArray<ImagePointer | null>): ThoughtTree {
  const ids = images.map((_, index) => `leaf_${index}`);
  const nodes: Record<string, ThoughtNode> = {
    doc: {
      id: "doc",
      role: "document-root",
      text: "",
      parentId: null,
      children: ids,
      createdAt: STAMP,
      updatedAt: STAMP,
    },
  };
  images.forEach((image, index) => {
    nodes[ids[index]!] = passage(ids[index]!, image ?? undefined);
  });
  return { ...createEmptyTree("capacity", 1), rootId: "doc", nodes };
}

describe("one picture, one description", () => {
  it.each<readonly [string, Partial<ImagePointer>]>([
    ["another size", { byteLength: 2_000 }],
    ["another media type", { mediaType: "image/jpeg" }],
    ["another width", { width: 1_024 }],
    ["another height", { height: 1_024 }],
  ])("refuses one content hash declared with %s", (_name, change) => {
    const tree = document([PNG, { ...PNG, ...change }]);
    expect(validateThoughtTree(tree)).toMatchObject({
      ok: false,
      error: { code: "TREE_INVARIANT_VIOLATION" },
    });
  });

  it("admits the same picture on several passages, and different pictures side by side", () => {
    expect(validateThoughtTree(document([PNG, { ...PNG }, null]))).toEqual({ ok: true });
    expect(validateThoughtTree(document([PNG, { ...PNG, contentHash: hashOf(1), mediaType: "image/jpeg" }])))
      .toEqual({ ok: true });
  });
});

describe("whether a passage can take one more picture", () => {
  const distinct = (index: number, byteLength = 1_000): ImagePointer =>
    ({ ...PNG, byteLength, contentHash: hashOf(index) });

  it("says yes in a document with room, with or without pictures elsewhere", () => {
    expect(treeCanTakePicture(document([null, null]), "leaf_0")).toBe(true);
    expect(treeCanTakePicture(document([distinct(1), null]), "leaf_1")).toBe(true);
  });

  it("says no when 32 other passages already hold a picture", () => {
    const full = document([...Array.from({ length: MAX_TREE_IMAGE_NODES }, (_, index) => distinct(index)), null]);
    expect(validateThoughtTree(full)).toEqual({ ok: true });
    expect(treeCanTakePicture(full, `leaf_${MAX_TREE_IMAGE_NODES}`)).toBe(false);
    const roomy = document([...Array.from({ length: MAX_TREE_IMAGE_NODES - 1 }, (_, index) => distinct(index)), null]);
    expect(treeCanTakePicture(roomy, `leaf_${MAX_TREE_IMAGE_NODES - 1}`)).toBe(true);
  });

  it("says yes for a passage that already holds a picture in a full document: it is replaced", () => {
    const full = document(Array.from({ length: MAX_TREE_IMAGE_NODES }, (_, index) => distinct(index)));
    expect(treeCanTakePicture(full, "leaf_0")).toBe(true);
    expect(treeCanTakePicture(full, `leaf_${MAX_TREE_IMAGE_NODES - 1}`)).toBe(true);
  });

  it("says no when the stored bytes leave less than the largest picture's room", () => {
    const big = (index: number) => distinct(index, MAX_IMAGE_POINTER_BYTES);
    const slots = MAX_TREE_IMAGE_BYTES / MAX_IMAGE_POINTER_BYTES;
    const exactlyFull = document([...Array.from({ length: slots }, (_, index) => big(index)), null]);
    expect(treeCanTakePicture(exactlyFull, `leaf_${slots}`)).toBe(false);
    const oneShort = document([...Array.from({ length: slots - 1 }, (_, index) => big(index)), null]);
    expect(treeCanTakePicture(oneShort, `leaf_${slots - 1}`)).toBe(true);
    // One byte of other pictures is enough to leave too little room.
    const barely = document([...Array.from({ length: slots - 1 }, (_, index) => big(index)), distinct(900, 1), null]);
    expect(treeCanTakePicture(barely, `leaf_${slots}`)).toBe(false);
  });

  it("does not count the replaced picture's bytes, and counts a shared hash once", () => {
    const big = (index: number) => distinct(index, MAX_IMAGE_POINTER_BYTES);
    const slots = MAX_TREE_IMAGE_BYTES / MAX_IMAGE_POINTER_BYTES;
    const full = document(Array.from({ length: slots }, (_, index) => big(index)));
    expect(treeCanTakePicture(full, "leaf_0")).toBe(true);
    // Many passages showing one 2 MiB picture cost 2 MiB in all.
    const shared = document([...Array.from({ length: 20 }, () => big(1)), null]);
    expect(treeCanTakePicture(shared, "leaf_20")).toBe(true);
    // A picture the replaced passage shares with another passage is still held by that one.
    const alsoHeld = document(Array.from({ length: slots + 1 }, (_, index) => big(Math.min(index, slots - 1))));
    expect(validateThoughtTree(alsoHeld)).toEqual({ ok: true });
    expect(treeCanTakePicture(alsoHeld, `leaf_${slots}`)).toBe(false);
    expect(treeCanTakePicture(alsoHeld, "leaf_0")).toBe(true);
  });

  it("says no for a passage that does not exist and for the document root", () => {
    const tree = document([null]);
    expect(treeCanTakePicture(tree, "missing")).toBe(false);
    expect(treeCanTakePicture(tree, "doc")).toBe(false);
    expect(treeCanTakePicture(tree, "__proto__")).toBe(false);
  });

  it("agrees with validation: a tree that can take a picture still validates with the largest one attached", () => {
    const tree = document([...Array.from({ length: 5 }, (_, index) => distinct(index, 3_000_000 > MAX_IMAGE_POINTER_BYTES ? MAX_IMAGE_POINTER_BYTES : 3_000_000)), null]);
    expect(treeCanTakePicture(tree, "leaf_5")).toBe(true);
    const attached = document([
      ...Array.from({ length: 5 }, (_, index) => distinct(index, MAX_IMAGE_POINTER_BYTES)),
      distinct(77, MAX_IMAGE_POINTER_BYTES),
    ]);
    expect(validateThoughtTree(attached)).toEqual({ ok: true });
  });
});
