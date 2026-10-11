import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATTER_LOCALE } from "../config/locales";
import { PictureDriver, type PictureDriverState } from "../interaction/picture-driver";
import { createPictureInFlightGate } from "../interaction/picture-in-flight-gate";
import { createPictureSessionCache } from "../interaction/picture-session-cache";
import type { ImageBlobRepository } from "../persistence/image-blob-repository";
import { IMAGE_RESPONSE_HEADERS } from "../protocol/image-contract";
import { SEEDED_DOCUMENT_NODE_IDS } from "../material/seeded-document";
import { FIXTURE_IMAGE_DATA_URL } from "../server/image-fixtures";
import { createMatterStore } from "../store/matter-store";
import {
  BROWSER_PICTURE_VISIBILITY,
  createPictureCommit,
  mintPictureCommandId,
  mintPictureRequestId,
  pictureCommitFromReceipt,
} from "./picture-authoring";

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
process.on("unhandledRejection", onUnhandled);

beforeEach(() => {
  unhandled.length = 0;
});
afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(unhandled).toEqual([]);
});

const TARGET = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
const PNG = Uint8Array.from(
  Buffer.from(FIXTURE_IMAGE_DATA_URL.slice(FIXTURE_IMAGE_DATA_URL.indexOf(",") + 1), "base64"),
);

describe("Keep's side of the store", () => {
  it("maps a receipt to the commit the driver understands: committed, stale, or rejected", () => {
    expect(pictureCommitFromReceipt({ status: "committed" })).toBe("committed");
    expect(pictureCommitFromReceipt({ status: "stale" })).toBe("stale");
    for (const status of ["rejected", "conflict", "unavailable", "committed ", ""]) {
      expect(pictureCommitFromReceipt({ status }), status).toBe("rejected");
    }
  });

  it("commits as the person, with the session's own document epoch and the mutation untouched", () => {
    const attachPicture = vi.fn(() => ({ status: "committed" }) as never);
    const commit = createPictureCommit({
      attachPicture,
      documentEpoch: 7,
      mintCommandId: () => "human_picture_fixed",
      now: () => "2026-10-12T00:00:00.000Z",
    });
    const mutation = {
      type: "replace-image" as const,
      nodeId: TARGET,
      expectedUpdatedAt: "t",
      expectedImage: null,
      image: null,
    };
    expect(commit(mutation)).toBe("committed");
    expect(attachPicture).toHaveBeenCalledWith(
      { commandId: "human_picture_fixed", createdAt: "2026-10-12T00:00:00.000Z", mutation },
      7,
    );
  });

  it("mints identities in the shapes the text swap's own use", () => {
    expect(mintPictureRequestId()).toMatch(/^picture_request_[0-9a-f]{32}$/);
    expect(mintPictureCommandId()).toMatch(/^human_picture_[0-9a-f]{32}$/);
    expect(mintPictureRequestId()).not.toBe(mintPictureRequestId());
  });

  it("reads the page's own visibility", () => {
    const listener = vi.fn();
    expect(BROWSER_PICTURE_VISIBILITY.isVisible()).toBe(true);
    expect(BROWSER_PICTURE_VISIBILITY.subscribe(listener)()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("a kept picture through the real store", () => {
  it("is one undoable step, and Undo and Redo touch neither the network nor the blob store", async () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const fetched = vi.fn(async () => new Response(PNG.slice(), {
      status: 200,
      headers: {
        "content-type": "image/png",
        [IMAGE_RESPONSE_HEADERS.width]: "1024",
        [IMAGE_RESPONSE_HEADERS.height]: "1024",
        [IMAGE_RESPONSE_HEADERS.sha256]: createHash("sha256").update(PNG).digest("hex"),
      },
    }));
    const putImageBlob = vi.fn<ImageBlobRepository["putImageBlob"]>(
      async () => ({ ok: true, value: "written" }) as const,
    );
    const states: PictureDriverState[] = [];
    const driver = new PictureDriver({
      nodeId: TARGET,
      getNode: (nodeId) => store.getState().tree.nodes[nodeId],
      subscribeTree: (listener) => store.subscribe(() => listener()),
      documentEpoch: () => store.getState().documentEpoch,
      mintRequestId: mintPictureRequestId,
      locale: () => MATTER_LOCALE.english,
      commit: createPictureCommit({
        attachPicture: (values, epoch) => store.getState().attachPicture(values, epoch),
        documentEpoch: store.getState().documentEpoch,
        mintCommandId: mintPictureCommandId,
        now: () => new Date().toISOString(),
      }),
      blobRepository: { putImageBlob },
      cache: createPictureSessionCache(),
      fetch: fetched as unknown as typeof fetch,
      inFlightGate: createPictureInFlightGate(),
      visibility: { isVisible: () => true, subscribe: () => () => undefined },
      subscribePageExit: () => () => undefined,
      onState: (state) => states.push(state),
    });
    try {
      driver.arm();
      driver.confirm();
      await vi.waitFor(() => expect(driver.state.phase).toBe("arrived"));
      expect(store.getState().tree.nodes[TARGET]?.image).toBeUndefined();

      await driver.accept();
      expect(driver.state.phase).toBe("accepted");
      const kept = store.getState().tree.nodes[TARGET]?.image;
      expect(kept).toMatchObject({ mediaType: "image/png", width: 1024, height: 1024 });
      expect(fetched).toHaveBeenCalledOnce();
      expect(putImageBlob).toHaveBeenCalledOnce();

      expect(store.getState().undo()).toMatchObject({ status: "committed" });
      expect(store.getState().tree.nodes[TARGET]?.image).toBeUndefined();
      expect(store.getState().redo()).toMatchObject({ status: "committed" });
      expect(store.getState().tree.nodes[TARGET]?.image).toEqual(kept);
      expect(fetched).toHaveBeenCalledOnce();
      expect(putImageBlob).toHaveBeenCalledOnce();
    } finally {
      driver.dispose();
    }
  });

  it("is stale when the passage moved on, and nothing is attached", async () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const node = store.getState().tree.nodes[TARGET]!;
    const commit = createPictureCommit({
      attachPicture: (values, epoch) => store.getState().attachPicture(values, epoch),
      documentEpoch: store.getState().documentEpoch,
      mintCommandId: mintPictureCommandId,
      now: () => new Date().toISOString(),
    });
    expect(commit({
      type: "replace-image",
      nodeId: TARGET,
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
      expectedImage: null,
      image: { mediaType: "image/png", byteLength: 4096, width: 1024, height: 1024, contentHash: "b".repeat(64) },
    })).toBe("stale");
    expect(store.getState().tree.nodes[TARGET]?.image).toBeUndefined();
    expect(node.updatedAt).toBe(store.getState().tree.nodes[TARGET]?.updatedAt);
  });

  it("is stale after a document switch, because the epoch is the session's own", () => {
    const store = createMatterStore("expanded", { documentRoot: true });
    const node = store.getState().tree.nodes[TARGET]!;
    const commit = createPictureCommit({
      attachPicture: (values, epoch) => store.getState().attachPicture(values, epoch),
      documentEpoch: store.getState().documentEpoch + 1,
      mintCommandId: mintPictureCommandId,
      now: () => new Date().toISOString(),
    });
    expect(commit({
      type: "replace-image",
      nodeId: TARGET,
      expectedUpdatedAt: node.updatedAt,
      expectedImage: null,
      image: { mediaType: "image/png", byteLength: 4096, width: 1024, height: 1024, contentHash: "b".repeat(64) },
    })).toBe("stale");
  });
});
