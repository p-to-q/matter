import { describe, expect, it } from "vitest";
import { SEEDED_DOCUMENT_NODE_IDS } from "../material/seeded-document";
import type { ImagePointer } from "../tree/image-pointer";
import { createMatterStore } from "./matter-store";

const TARGET = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
const OTHER = SEEDED_DOCUMENT_NODE_IDS.bodilyMemory;
const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: 4096,
  width: 1024,
  height: 1024,
  contentHash: "a".repeat(64),
};
const ELSEWHERE: ImagePointer = { ...POINTER, contentHash: "b".repeat(64) };

function fresh() {
  const store = createMatterStore("expanded", { documentRoot: true });
  const node = store.getState().tree.nodes[TARGET];
  if (node === undefined) throw new Error("fixture passage is missing");
  return { store, updatedAt: node.updatedAt };
}

function keep(
  store: ReturnType<typeof fresh>["store"],
  nodeId: string,
  expectedUpdatedAt: string,
  expectedImage: ImagePointer | null,
  image: ImagePointer | null,
  epoch = store.getState().documentEpoch,
) {
  return store.getState().attachPicture(
    {
      commandId: `keep_${Math.random().toString(36).slice(2)}`,
      createdAt: "2026-10-12T00:00:00.000Z",
      mutation: { type: "replace-image", nodeId, expectedUpdatedAt, expectedImage, image },
    },
    epoch,
  );
}

describe("Matter store picture keep", () => {
  it("attaches a pointer as one undoable human step that leaves the passage text and clock alone", () => {
    const { store, updatedAt } = fresh();
    const before = store.getState().tree.nodes[TARGET];
    expect(keep(store, TARGET, updatedAt, null, POINTER)).toMatchObject({ status: "committed" });
    const after = store.getState().tree.nodes[TARGET];
    expect(after?.image).toEqual(POINTER);
    expect(after?.text).toBe(before?.text);
    expect(after?.updatedAt).toBe(updatedAt);

    expect(store.getState().undo()).toMatchObject({ operation: "undo", status: "committed" });
    expect(store.getState().tree.nodes[TARGET]?.image).toBeUndefined();
    expect(store.getState().redo()).toMatchObject({ operation: "redo", status: "committed" });
    expect(store.getState().tree.nodes[TARGET]?.image).toEqual(POINTER);
  });

  it("survives an unrelated edit elsewhere, because the mementos decide staleness", () => {
    const { store, updatedAt } = fresh();
    store.getState().extendMaterial(OTHER, {
      nodeId: "thought_unrelated",
      createdAt: "2026-10-12T00:00:01.000Z",
    });
    expect(keep(store, TARGET, updatedAt, null, POINTER)).toMatchObject({ status: "committed" });
  });

  it("is stale when the passage changed, vanished, or already holds another picture", () => {
    const { store, updatedAt } = fresh();
    expect(keep(store, TARGET, "1999-01-01T00:00:00.000Z", null, POINTER)).toMatchObject({ status: "stale" });
    expect(keep(store, "thought_missing", updatedAt, null, POINTER)).toMatchObject({ status: "stale" });
    expect(keep(store, TARGET, updatedAt, null, POINTER)).toMatchObject({ status: "committed" });
    expect(keep(store, TARGET, updatedAt, null, ELSEWHERE)).toMatchObject({ status: "stale" });
    expect(store.getState().tree.nodes[TARGET]?.image).toEqual(POINTER);
  });

  it("replaces a held picture only when the caller names it", () => {
    const { store, updatedAt } = fresh();
    keep(store, TARGET, updatedAt, null, POINTER);
    expect(keep(store, TARGET, updatedAt, POINTER, ELSEWHERE)).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes[TARGET]?.image).toEqual(ELSEWHERE);
  });

  it("publishes nothing for another document epoch", () => {
    const { store, updatedAt } = fresh();
    const revision = store.getState().tree.revision;
    expect(keep(store, TARGET, updatedAt, null, POINTER, store.getState().documentEpoch + 1))
      .toMatchObject({ status: "stale", revision });
    expect(store.getState().tree.revision).toBe(revision);
    expect(store.getState().tree.nodes[TARGET]?.image).toBeUndefined();
  });

  it("reports an engine refusal as rejected, not stale", () => {
    const { store, updatedAt } = fresh();
    // The same pointer on both sides changes nothing, which the engine refuses.
    expect(keep(store, TARGET, updatedAt, null, null)).toMatchObject({ status: "rejected" });
  });
});
