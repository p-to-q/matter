import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATTER_LOCALE, type MatterLocale } from "../config/locales";
import { IMAGE_RESPONSE_HEADERS, MAX_IMAGE_PASSAGE_CODE_POINTS } from "../protocol/image-contract";
import { PROTOCOL_VERSION } from "../tree/model";
import type { ImageBlobFailureCode, ImageBlobRepository } from "../persistence/image-blob-repository";
import type { GeneratedPicture, PictureFailureReason } from "../runtime/picture-turn";
import { equalImagePointers, type ImagePointer } from "../tree/image-pointer";
import type { PictureCommit } from "./accept-picture";
import type { PageExit } from "./page-suspension";
import { requestPicture, type PictureRequestResult } from "./picture-client";
import {
  PICTURE_ACCEPT_OUTCOMES,
  PictureDriver,
  type PictureDriverState,
  type PictureNodeView,
} from "./picture-driver";
import { createPictureInFlightGate, type PictureInFlightGate } from "./picture-in-flight-gate";
import { createPictureSessionCache } from "./picture-session-cache";

vi.mock("./picture-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./picture-client")>();
  return { ...actual, requestPicture: vi.fn(actual.requestPicture) };
});

const requestMock = vi.mocked(requestPicture);
const REAL_REQUEST = (await vi.importActual<typeof import("./picture-client")>("./picture-client")).requestPicture;

const NODE = "node-1";
const OTHER = "node-2";
const PASSAGE = "SECRET-PASSAGE about my brother and the unpaid rent.";
const T0 = "2026-10-12T00:00:00.000Z";
const T1 = "2026-10-12T00:00:05.000Z";

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
process.on("unhandledRejection", onUnhandled);

const drivers: PictureDriver[] = [];

beforeEach(() => {
  unhandled.length = 0;
});

afterEach(async () => {
  for (const driver of drivers.splice(0)) driver.dispose();
  await flush();
  expect(unhandled).toEqual([]);
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Pending = {
  envelope: Parameters<typeof requestPicture>[0];
  signal: AbortSignal;
  resolve: (result: PictureRequestResult) => void;
  reject: (error: unknown) => void;
};

type HarnessOptions = Readonly<{
  text?: string;
  image?: ImagePointer;
  visible?: boolean;
  gate?: PictureInFlightGate;
  blob?: ImageBlobFailureCode | "throw";
  commit?: "stale" | "rejected" | "throw";
  real?: Readonly<{ fetch: typeof fetch }>;
  locale?: MatterLocale;
  throwingListener?: boolean;
}>;

function createHarness(options: HarnessOptions = {}) {
  const nodes = new Map<string, PictureNodeView>([
    [NODE, { text: options.text ?? PASSAGE, updatedAt: T0, ...(options.image ? { image: options.image } : {}) }],
    [OTHER, { text: "another passage", updatedAt: T0 }],
  ]);
  const treeListeners = new Set<() => void>();
  let epoch = 1;
  const notifyTree = () => { for (const listener of [...treeListeners]) listener(); };
  const edit = (id: string, patch: Partial<PictureNodeView>) => {
    nodes.set(id, { ...nodes.get(id)!, ...patch });
    notifyTree();
  };

  let visible = options.visible ?? true;
  const visibilityListeners = new Set<() => void>();
  const visibility = {
    isVisible: () => visible,
    subscribe: vi.fn((listener: () => void) => {
      visibilityListeners.add(listener);
      return () => { visibilityListeners.delete(listener); };
    }),
  };
  const setVisible = (value: boolean) => {
    visible = value;
    for (const listener of [...visibilityListeners]) listener();
  };

  const exitListeners = new Set<(exit: PageExit) => void>();
  const subscribePageExit = vi.fn((listener: (exit: PageExit) => void) => {
    exitListeners.add(listener);
    return () => { exitListeners.delete(listener); };
  });

  const order: string[] = [];
  const putImageBlob = vi.fn<ImageBlobRepository["putImageBlob"]>(async () => {
    order.push("put-blob");
    if (options.blob === "throw") throw new Error(`disk exploded near ${PASSAGE}`);
    return options.blob === undefined
      ? ({ ok: true, value: "written" } as const)
      : ({ ok: false, code: options.blob } as const);
  });
  const commit = vi.fn<PictureCommit>((mutation) => {
    order.push("commit");
    if (options.commit === "throw") throw new Error(`engine exploded near ${PASSAGE}`);
    if (options.commit !== undefined) return options.commit;
    const node = nodes.get(mutation.nodeId);
    if (
      node === undefined ||
      node.updatedAt !== mutation.expectedUpdatedAt ||
      !equalImagePointers(node.image, mutation.expectedImage)
    ) return "stale";
    // The store's commit changes the node and notifies, exactly like a real one.
    edit(mutation.nodeId, { ...(mutation.image === null ? {} : { image: mutation.image }), updatedAt: T1 });
    return "committed";
  });

  const gate = options.gate ?? createPictureInFlightGate();
  const cache = createPictureSessionCache();
  const states: PictureDriverState[] = [];
  let ids = 0;
  const mintRequestId = vi.fn(() => `request-${++ids}`);
  let locale = options.locale ?? MATTER_LOCALE.english;

  const pending: Pending[] = [];
  if (options.real === undefined) {
    requestMock.mockImplementation((envelope, requestOptions) => new Promise((resolve, reject) => {
      pending.push({ envelope, signal: requestOptions.signal, resolve, reject });
    }));
  } else {
    requestMock.mockImplementation(REAL_REQUEST);
  }

  const driver = new PictureDriver({
    nodeId: NODE,
    getNode: (id) => nodes.get(id),
    subscribeTree: (listener) => {
      treeListeners.add(listener);
      return () => { treeListeners.delete(listener); };
    },
    documentEpoch: () => epoch,
    mintRequestId,
    locale: () => locale,
    commit,
    blobRepository: { putImageBlob },
    cache,
    ...(options.real === undefined ? {} : { fetch: options.real.fetch }),
    inFlightGate: gate,
    visibility,
    subscribePageExit,
    onState: (state) => {
      states.push(state);
      if (options.throwingListener) throw new Error("presentation fault");
    },
  });
  drivers.push(driver);

  return {
    driver, nodes, edit, notifyTree, treeListeners, gate, cache, states, commit, putImageBlob, order,
    mintRequestId, visibility, setVisible, visibilityListeners, exitListeners, subscribePageExit, pending,
    setEpoch: (value: number) => { epoch = value; },
    setLocale: (value: MatterLocale) => { locale = value; },
    phases: () => states.map((state) => state.phase),
    toDrawing() {
      driver.arm();
      driver.confirm();
      expect(driver.state.phase).toBe("drawing");
    },
    async arrive(seed = 1) {
      const held = picture(seed);
      pending.at(-1)!.resolve({ ok: true, picture: held });
      await flush();
      return held;
    },
    async toArrived(seed = 1) {
      this.toDrawing();
      return this.arrive(seed);
    },
    async answer(result: PictureRequestResult) {
      pending.at(-1)!.resolve(result);
      await flush();
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

describe("picture driver", () => {
  describe("the happy path", () => {
    it("arms, sends one request from the live passage, receives a picture, and keeps it", async () => {
      const h = createHarness({ locale: MATTER_LOCALE.german });
      h.driver.arm();
      expect(h.driver.state).toMatchObject({ phase: "arming" });
      expect(requestMock).not.toHaveBeenCalled();

      h.driver.confirm();
      expect(h.driver.state).toEqual({ phase: "drawing", requestId: "request-1", priorAttemptMayHaveBeenBilled: false });
      expect(requestMock).toHaveBeenCalledOnce();
      expect(h.pending[0]!.envelope).toEqual({
        protocolVersion: PROTOCOL_VERSION,
        requestVersion: "image/1",
        id: "request-1",
        locale: "de-DE",
        passage: { nodeId: NODE, text: PASSAGE },
      });
      expect("direction" in h.pending[0]!.envelope).toBe(false);
      expect(h.gate.heldBy()).toBe(NODE);

      const held = await h.arrive();
      expect(h.driver.state).toMatchObject({ phase: "arrived", picture: held });
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.gate.heldBy()).toBeNull();

      await h.driver.accept();
      expect(h.driver.state).toEqual({ phase: "accepted", priorAttemptMayHaveBeenBilled: false });
      expect(h.commit).toHaveBeenCalledOnce();
      expect(h.commit).toHaveBeenCalledWith({
        type: "replace-image",
        nodeId: NODE,
        expectedUpdatedAt: T0,
        expectedImage: null,
        image: held.pointer,
      });
      expect(h.order).toEqual(["put-blob", "commit"]);
      expect(h.cache.has(held.pointer.contentHash)).toBe(true);
      expect(h.phases()).toEqual(["arming", "drawing", "arrived", "accepted"]);
      expect(h.treeListeners.size).toBe(0);
      expect(h.exitListeners.size).toBe(0);
    });

    it("keeps the live node's own commit from reading as the passage moving on", async () => {
      const h = createHarness();
      await h.toArrived();
      await h.driver.accept();
      expect(h.nodes.get(NODE)!.updatedAt).toBe(T1);
      expect(h.phases()).not.toContain("stale");
      expect(h.driver.state.phase).toBe("accepted");
    });

    it("hands the commit the passage's own picture as the expected one when it already has one", async () => {
      const previous = picture(9).pointer;
      const h = createHarness({ image: previous });
      const held = await h.toArrived(2);
      await h.driver.accept();
      expect(h.commit).toHaveBeenCalledWith(expect.objectContaining({
        expectedImage: previous,
        image: held.pointer,
      }));
      expect(h.driver.state.phase).toBe("accepted");
    });

    it("exposes the same object it announces", async () => {
      const h = createHarness();
      await h.toArrived();
      expect(h.driver.state).toBe(h.states.at(-1));
      const count = h.states.length;
      h.driver.arm();
      h.driver.back();
      h.driver.back();
      expect(h.states.length).toBe(count);
    });

    it("discards without touching the store, the cache, or the tree", async () => {
      const h = createHarness();
      const held = await h.toArrived();
      h.driver.discard();
      expect(h.driver.state.phase).toBe("discarded");
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.putImageBlob).not.toHaveBeenCalled();
      expect(h.cache.has(held.pointer.contentHash)).toBe(false);
      expect(h.treeListeners.size).toBe(0);
    });

    it("goes back from the arm step without minting an id or sending", () => {
      const h = createHarness();
      h.driver.arm();
      h.driver.back();
      expect(h.driver.state.phase).toBe("idle");
      expect(h.mintRequestId).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    });

    it("can draw again after a discard, from the passage as it is then", async () => {
      const h = createHarness();
      await h.toArrived();
      h.driver.discard();
      h.nodes.set(NODE, { text: "a different passage", updatedAt: T1 });
      h.driver.arm();
      h.driver.confirm();
      expect(h.pending).toHaveLength(2);
      expect(h.pending[1]!.envelope.id).toBe("request-2");
      expect(h.pending[1]!.envelope.passage.text).toBe("a different passage");
    });
  });

  describe("confirm", () => {
    it("ignores a second confirm while drawing: one id, one request", () => {
      const h = createHarness();
      h.toDrawing();
      h.driver.confirm();
      h.driver.confirm();
      expect(h.mintRequestId).toHaveBeenCalledOnce();
      expect(requestMock).toHaveBeenCalledOnce();
      expect(h.states).toHaveLength(2);
    });

    it("calls the transport once for a double confirm", async () => {
      const send = vi.fn(() => new Promise<Response>(() => undefined));
      const h = createHarness({ real: { fetch: send as unknown as typeof fetch } });
      h.toDrawing();
      h.driver.confirm();
      h.driver.confirm();
      await flush();
      expect(send).toHaveBeenCalledOnce();
    });

    it("sends the envelope through the transport as one JSON body", async () => {
      const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return imageResponse(png(512, 384));
      });
      const h = createHarness({ real: { fetch: send as unknown as typeof fetch } });
      h.toDrawing();
      await flush();
      expect(send).toHaveBeenCalledOnce();
      const [url, init] = send.mock.calls[0]!;
      expect(url).toBe("/matter/api/image");
      expect(JSON.parse(String(init?.body))).toEqual({
        protocolVersion: PROTOCOL_VERSION,
        requestVersion: "image/1",
        id: "request-1",
        locale: "en-US",
        passage: { nodeId: NODE, text: PASSAGE },
      });
      await vi.waitFor(() => expect(h.driver.state.phase).toBe("arrived"));
    });

    it("reads the locale at confirm, not before and not after", () => {
      const h = createHarness({ locale: MATTER_LOCALE.japanese });
      h.driver.arm();
      h.setLocale(MATTER_LOCALE.simplifiedChinese);
      h.driver.confirm();
      h.setLocale(MATTER_LOCALE.german);
      expect(h.pending[0]!.envelope.locale).toBe("zh-CN");
    });

    it("does nothing unless the turn is at the arm step", () => {
      const h = createHarness();
      h.driver.confirm();
      expect(h.mintRequestId).not.toHaveBeenCalled();
      expect(h.driver.state.phase).toBe("idle");
    });

    describe.each([
      ["a missing passage", (h: Harness) => { h.nodes.delete(NODE); }],
      ["an empty passage", (h: Harness) => { h.nodes.set(NODE, { text: "", updatedAt: T0 }); }],
      ["a blank passage", (h: Harness) => { h.nodes.set(NODE, { text: " \n\t ", updatedAt: T0 }); }],
      ["a passage over the bound", (h: Harness) => {
        h.nodes.set(NODE, { text: "a".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS + 1), updatedAt: T0 });
      }],
      ["a passage with a lone surrogate", (h: Harness) => { h.nodes.set(NODE, { text: "broken \ud800", updatedAt: T0 }); }],
    ])("refuses to send for %s", (_name, arrange) => {
      it("moves to stale, takes no slot, and sends nothing", () => {
        const h = createHarness();
        h.driver.arm();
        arrange(h);
        h.driver.confirm();
        expect(h.driver.state).toEqual({ phase: "stale", priorAttemptMayHaveBeenBilled: false });
        expect(requestMock).not.toHaveBeenCalled();
        expect(h.gate.heldBy()).toBeNull();
        expect(h.treeListeners.size).toBe(0);
        expect(h.exitListeners.size).toBe(0);
      });
    });

    it("accepts a passage exactly at the bound, counted in code points not code units", () => {
      createHarness({ text: "a".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS) }).toDrawing();
      const astral = createHarness({ text: "\u{1F600}".repeat(MAX_IMAGE_PASSAGE_CODE_POINTS) });
      astral.toDrawing();
      expect(astral.pending[0]!.envelope.passage.text.length).toBe(MAX_IMAGE_PASSAGE_CODE_POINTS * 2);
    });

    it("can draw again after a refusal once the passage is sendable", () => {
      const h = createHarness({ text: "" });
      h.driver.arm();
      h.driver.confirm();
      expect(h.driver.state.phase).toBe("stale");
      h.nodes.set(NODE, { text: "now there is something", updatedAt: T1 });
      h.driver.arm();
      h.driver.confirm();
      expect(h.driver.state.phase).toBe("drawing");
    });
  });

  describe("a passage that moves on", () => {
    function expectAbandoned(h: Harness) {
      expect(h.driver.state).toEqual({ phase: "stale", priorAttemptMayHaveBeenBilled: true });
      expect(h.pending[0]!.signal.aborted).toBe(true);
      expect(h.gate.heldBy()).toBeNull();
      expect(h.treeListeners.size).toBe(0);
      expect(h.exitListeners.size).toBe(0);
    }

    async function expectLateAnswerDropped(h: Harness) {
      const states = h.states.length;
      await h.arrive();
      expect(h.states).toHaveLength(states);
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.putImageBlob).not.toHaveBeenCalled();
      expect(h.cache.snapshot().size).toBe(0);
    }

    it("is stale when the text changes, and the late picture reaches nothing", async () => {
      const h = createHarness();
      h.toDrawing();
      h.edit(NODE, { text: `${PASSAGE} and more`, updatedAt: T1 });
      expectAbandoned(h);
      await expectLateAnswerDropped(h);
      await h.driver.accept();
      expect(h.commit).not.toHaveBeenCalled();
    });

    it("is stale when only the text changes", () => {
      const h = createHarness();
      h.toDrawing();
      h.edit(NODE, { text: "different" });
      expectAbandoned(h);
    });

    it("is stale when only updatedAt changes", () => {
      const h = createHarness();
      h.toDrawing();
      h.edit(NODE, { updatedAt: T1 });
      expectAbandoned(h);
    });

    it("is stale when only the picture changes", () => {
      const h = createHarness();
      h.toDrawing();
      h.edit(NODE, { image: picture(7).pointer });
      expectAbandoned(h);
    });

    it("is stale when the passage is deleted", async () => {
      const h = createHarness();
      h.toDrawing();
      h.nodes.delete(NODE);
      h.notifyTree();
      expectAbandoned(h);
      await expectLateAnswerDropped(h);
    });

    it("is stale when the document epoch changes", async () => {
      const h = createHarness();
      h.toDrawing();
      h.setEpoch(2);
      h.notifyTree();
      expectAbandoned(h);
      await expectLateAnswerDropped(h);
    });

    it("ignores a change to another passage", async () => {
      const h = createHarness();
      h.toDrawing();
      h.edit(OTHER, { text: "edited elsewhere", updatedAt: T1 });
      h.notifyTree();
      expect(h.driver.state.phase).toBe("drawing");
      expect(h.pending[0]!.signal.aborted).toBe(false);
      expect(h.gate.heldBy()).toBe(NODE);
      await h.arrive();
      expect(h.driver.state.phase).toBe("arrived");
    });

    it("ignores a notification that changed nothing", () => {
      const h = createHarness();
      h.toDrawing();
      h.notifyTree();
      expect(h.driver.state.phase).toBe("drawing");
    });

    it("catches a change no notification announced when the picture arrives", async () => {
      const h = createHarness();
      h.toDrawing();
      h.nodes.set(NODE, { text: "changed quietly", updatedAt: T0 });
      await h.arrive();
      expect(h.driver.state).toEqual({ phase: "stale", priorAttemptMayHaveBeenBilled: true });
      expect(h.states.map((state) => state.phase)).not.toContain("arrived");
    });

    it("catches a quiet epoch change when the picture arrives", async () => {
      const h = createHarness();
      h.toDrawing();
      h.setEpoch(3);
      await h.arrive();
      expect(h.driver.state.phase).toBe("stale");
    });

    it("makes an arrived picture stale when its passage is then edited", async () => {
      const h = createHarness();
      const held = await h.toArrived();
      h.edit(NODE, { text: "edited after the picture came", updatedAt: T1 });
      expect(h.driver.state).toEqual({ phase: "stale", priorAttemptMayHaveBeenBilled: false });
      await h.driver.accept();
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.cache.has(held.pointer.contentHash)).toBe(false);
      expect(h.treeListeners.size).toBe(0);
    });

    it("refuses Keep without writing when the passage moved without a notification", async () => {
      const h = createHarness();
      await h.toArrived();
      h.nodes.set(NODE, { text: "moved quietly", updatedAt: T0 });
      await h.driver.accept();
      expect(h.driver.state.phase).toBe("stale");
      expect(h.putImageBlob).not.toHaveBeenCalled();
      expect(h.commit).not.toHaveBeenCalled();
    });

    it("lets the next request own the turn after an old one went stale", async () => {
      const h = createHarness();
      h.toDrawing();
      h.edit(NODE, { text: "second version", updatedAt: T1 });
      h.driver.arm();
      h.driver.confirm();
      expect(h.pending).toHaveLength(2);
      h.pending[0]!.resolve({ ok: true, picture: picture(1) });
      await flush();
      expect(h.driver.state).toMatchObject({ phase: "drawing", requestId: "request-2" });
      h.pending[1]!.resolve({ ok: true, picture: picture(2) });
      await flush();
      expect(h.driver.state).toMatchObject({ phase: "arrived", picture: { pointer: picture(2).pointer } });
    });
  });

  describe("stop waiting", () => {
    it("ends the wait, sets the billed flag, aborts, frees the slot, and drops the late picture", async () => {
      const h = createHarness();
      h.toDrawing();
      h.driver.stopWaiting();
      expect(h.driver.state).toEqual({ phase: "cancelled", priorAttemptMayHaveBeenBilled: true });
      expect(h.pending[0]!.signal.aborted).toBe(true);
      expect(h.gate.heldBy()).toBeNull();
      expect(h.treeListeners.size).toBe(0);

      await h.arrive();
      expect(h.driver.state.phase).toBe("cancelled");
      expect(h.cache.snapshot().size).toBe(0);
      expect(h.commit).not.toHaveBeenCalled();
    });

    it("carries the billed flag into the next arm", () => {
      const h = createHarness();
      h.toDrawing();
      h.driver.stopWaiting();
      h.driver.arm();
      expect(h.driver.state).toEqual({ phase: "arming", priorAttemptMayHaveBeenBilled: true });
    });

    it("does nothing outside a request", async () => {
      const h = createHarness();
      h.driver.stopWaiting();
      h.driver.arm();
      h.driver.stopWaiting();
      expect(h.driver.state.phase).toBe("arming");
      await h.toArrived();
      h.driver.stopWaiting();
      expect(h.driver.state.phase).toBe("arrived");
    });

    it("lets a new request draw while the old relay is presumably still running", async () => {
      const h = createHarness();
      h.toDrawing();
      h.driver.stopWaiting();
      h.driver.arm();
      h.driver.confirm();
      h.pending[0]!.resolve({ ok: true, picture: picture(1) });
      await flush();
      expect(h.driver.state).toMatchObject({ phase: "drawing", requestId: "request-2" });
      expect(h.gate.heldBy()).toBe(NODE);
    });
  });

  describe("a settlement that is not for this request", () => {
    it("is dropped even when the injected minter reuses an id", async () => {
      const h = createHarness();
      h.mintRequestId.mockImplementation(() => "same-id");
      h.toDrawing();
      h.driver.stopWaiting();
      h.driver.arm();
      h.driver.confirm();
      expect(h.pending).toHaveLength(2);

      h.pending[0]!.resolve({ ok: true, picture: picture(1) });
      await flush();
      expect(h.driver.state).toMatchObject({ phase: "drawing", requestId: "same-id" });
      expect(h.gate.heldBy()).toBe(NODE);

      h.pending[0]!.reject(new Error("late"));
      await flush();
      expect(h.driver.state.phase).toBe("drawing");

      h.pending[1]!.resolve({ ok: true, picture: picture(2) });
      await flush();
      expect(h.driver.state).toMatchObject({ phase: "arrived", picture: { pointer: picture(2).pointer } });
    });

    it("cannot fail a turn it no longer owns, even with a reused id", async () => {
      const h = createHarness();
      h.mintRequestId.mockImplementation(() => "same-id");
      h.toDrawing();
      h.driver.stopWaiting();
      h.driver.arm();
      h.driver.confirm();
      h.pending[0]!.resolve({ ok: false, reason: "timeout", retryable: false });
      await flush();
      expect(h.driver.state.phase).toBe("drawing");
    });
  });

  describe("dispose", () => {
    it("aborts without churn, frees the slot, and drops a late picture", async () => {
      const h = createHarness();
      h.toDrawing();
      const announced = h.states.length;
      h.driver.dispose();
      expect(h.pending[0]!.signal.aborted).toBe(true);
      expect(h.gate.heldBy()).toBeNull();
      expect(h.treeListeners.size).toBe(0);
      expect(h.exitListeners.size).toBe(0);
      expect(h.states).toHaveLength(announced);
      expect(h.driver.state.phase).toBe("drawing");

      await h.arrive();
      expect(h.states).toHaveLength(announced);
      expect(h.cache.snapshot().size).toBe(0);
      expect(h.commit).not.toHaveBeenCalled();
    });

    it("makes every later call a no-op, and is idempotent", async () => {
      const h = createHarness();
      await h.toArrived();
      h.driver.dispose();
      h.driver.dispose();
      const announced = h.states.length;
      h.driver.arm();
      h.driver.back();
      h.driver.confirm();
      h.driver.stopWaiting();
      h.driver.discard();
      await h.driver.accept();
      expect(h.states).toHaveLength(announced);
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.putImageBlob).not.toHaveBeenCalled();
      expect(requestMock).toHaveBeenCalledOnce();
    });

    it("ignores tree, visibility, and page events afterwards", () => {
      const h = createHarness();
      h.toDrawing();
      h.driver.dispose();
      const announced = h.states.length;
      h.edit(NODE, { text: "after dispose", updatedAt: T1 });
      h.setVisible(false);
      expect(h.states).toHaveLength(announced);
    });

    it("never starts a request when disposed at the arm step", () => {
      const h = createHarness();
      h.driver.arm();
      h.driver.dispose();
      h.driver.confirm();
      expect(requestMock).not.toHaveBeenCalled();
      expect(h.gate.heldBy()).toBeNull();
    });

    it("stops watching visibility while a picture is held", async () => {
      const h = createHarness({ visible: false });
      h.toDrawing();
      await h.arrive();
      expect(h.visibilityListeners.size).toBe(1);
      h.driver.dispose();
      expect(h.visibilityListeners.size).toBe(0);
      expect(h.gate.heldBy()).toBeNull();
    });

    it("drops a Keep in progress without reporting on it", async () => {
      let release!: () => void;
      const h = createHarness();
      await h.toArrived();
      h.putImageBlob.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        return { ok: true, value: "written" } as const;
      });
      const keeping = h.driver.accept();
      await flush();
      h.driver.dispose();
      const announced = h.states.length;
      release();
      await keeping;
      expect(h.states).toHaveLength(announced);
    });
  });

  describe("page exit", () => {
    it("ends the wait on a real unload", () => {
      const h = createHarness();
      h.toDrawing();
      for (const listener of [...h.exitListeners]) listener({ persisted: false });
      expect(h.driver.state).toEqual({ phase: "cancelled", priorAttemptMayHaveBeenBilled: true });
      expect(h.pending[0]!.signal.aborted).toBe(true);
      expect(h.gate.heldBy()).toBeNull();
    });

    it("keeps the wait through a back-forward-cache hide", async () => {
      const h = createHarness();
      h.toDrawing();
      for (const listener of [...h.exitListeners]) listener({ persisted: true });
      expect(h.driver.state.phase).toBe("drawing");
      expect(h.pending[0]!.signal.aborted).toBe(false);
      expect(h.gate.heldBy()).toBe(NODE);
      await h.arrive();
      expect(h.driver.state.phase).toBe("arrived");
    });

    it("watches only while a request is out", async () => {
      const h = createHarness();
      h.driver.arm();
      expect(h.subscribePageExit).not.toHaveBeenCalled();
      h.driver.confirm();
      expect(h.exitListeners.size).toBe(1);
      await h.arrive();
      expect(h.exitListeners.size).toBe(0);
    });
  });

  describe("arrival on a hidden page", () => {
    it("holds the picture until the page is visible, and never keeps it by itself", async () => {
      const h = createHarness({ visible: false });
      h.toDrawing();
      const held = await h.arrive();
      expect(h.driver.state.phase).toBe("drawing");
      expect(h.gate.heldBy()).toBe(NODE);

      h.setVisible(false);
      expect(h.driver.state.phase).toBe("drawing");

      h.setVisible(true);
      expect(h.driver.state).toMatchObject({ phase: "arrived", picture: held });
      expect(h.gate.heldBy()).toBeNull();
      expect(h.visibilityListeners.size).toBe(0);
      await flush();
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.putImageBlob).not.toHaveBeenCalled();
    });

    it("does not watch visibility when the page is visible at arrival", async () => {
      const h = createHarness();
      await h.toArrived();
      expect(h.visibility.subscribe).not.toHaveBeenCalled();
    });

    it("goes stale, not arrived, when the passage changed while hidden", async () => {
      const h = createHarness({ visible: false });
      h.toDrawing();
      await h.arrive();
      h.edit(NODE, { text: "edited while hidden", updatedAt: T1 });
      expect(h.driver.state.phase).toBe("stale");
      h.setVisible(true);
      expect(h.driver.state.phase).toBe("stale");
      expect(h.states.map((state) => state.phase)).not.toContain("arrived");
    });

    it("catches a quiet change at the moment of release", async () => {
      const h = createHarness({ visible: false });
      h.toDrawing();
      await h.arrive();
      h.nodes.set(NODE, { text: "moved quietly", updatedAt: T0 });
      h.setVisible(true);
      expect(h.driver.state.phase).toBe("stale");
    });

    it("lets a stop-waiting beat a held picture", async () => {
      const h = createHarness({ visible: false });
      h.toDrawing();
      await h.arrive();
      h.driver.stopWaiting();
      h.setVisible(true);
      expect(h.driver.state.phase).toBe("cancelled");
      expect(h.visibilityListeners.size).toBe(0);
    });
  });

  describe("the in-flight gate", () => {
    it("refuses the send when another picture is in flight: closed, retryable, unbilled", () => {
      const gate = createPictureInFlightGate();
      const release = gate.tryEnter(OTHER)!;
      const h = createHarness({ gate });
      h.driver.arm();
      h.driver.confirm();
      expect(h.driver.state).toEqual({
        phase: "failed-retryable",
        reason: "another-picture-in-flight",
        priorAttemptMayHaveBeenBilled: false,
      });
      expect(requestMock).not.toHaveBeenCalled();
      expect(gate.heldBy()).toBe(OTHER);
      expect(h.treeListeners.size).toBe(0);
      expect(h.exitListeners.size).toBe(0);
      // The person never sees a request that was never made.
      expect(h.phases()).toEqual(["arming", "failed-retryable"]);

      release();
      h.driver.arm();
      h.driver.confirm();
      expect(h.driver.state.phase).toBe("drawing");
      expect(requestMock).toHaveBeenCalledOnce();
    });

    it("keeps two drivers from drawing at once", () => {
      const gate = createPictureInFlightGate();
      const first = createHarness({ gate });
      first.toDrawing();
      const second = createHarness({ gate });
      second.driver.arm();
      second.driver.confirm();
      expect(second.driver.state).toMatchObject({ phase: "failed-retryable", reason: "another-picture-in-flight" });
      first.driver.stopWaiting();
      second.driver.arm();
      second.driver.confirm();
      expect(second.driver.state.phase).toBe("drawing");
    });

    const scenarios: ReadonlyArray<readonly [string, (h: Harness) => Promise<void> | void]> = [
      ["a picture arriving", (h) => h.answer({ ok: true, picture: picture(1) })],
      ["a retryable failure", (h) => h.answer({ ok: false, reason: "server-error:RATE_LIMITED", retryable: true })],
      ["a final failure", (h) => h.answer({ ok: false, reason: "network", retryable: false })],
      ["a timeout", (h) => h.answer({ ok: false, reason: "timeout", retryable: false })],
      ["stop waiting", (h) => { h.driver.stopWaiting(); }],
      ["the passage changing", (h) => { h.edit(NODE, { text: "changed", updatedAt: T1 }); }],
      ["the passage being deleted", (h) => { h.nodes.delete(NODE); h.notifyTree(); }],
      ["the document changing", (h) => { h.setEpoch(9); h.notifyTree(); }],
      ["a real unload", (h) => { for (const listener of [...h.exitListeners]) listener({ persisted: false }); }],
      ["dispose", (h) => { h.driver.dispose(); }],
      ["a request that throws", (h) => { h.pending.at(-1)!.reject(new Error(`relay said ${PASSAGE}`)); return flush(); }],
    ];

    it.each(scenarios)("is freed by %s", async (_name, end) => {
      const h = createHarness();
      h.toDrawing();
      expect(h.gate.heldBy()).toBe(NODE);
      await end(h);
      await flush();
      expect(h.gate.heldBy()).toBeNull();
      expect(h.gate.tryEnter("probe")).not.toBeNull();
    });

    it("is freed by dispose while a held picture waits on a hidden page", async () => {
      const h = createHarness({ visible: false });
      h.toDrawing();
      await h.arrive();
      expect(h.gate.heldBy()).toBe(NODE);
      h.driver.dispose();
      expect(h.gate.heldBy()).toBeNull();
    });

    it("is never taken by a refusal to send", () => {
      const h = createHarness({ text: "" });
      h.driver.arm();
      h.driver.confirm();
      expect(h.gate.heldBy()).toBeNull();
    });

    it("is not held while a picture waits to be kept or discarded", async () => {
      const h = createHarness();
      await h.toArrived();
      expect(h.gate.heldBy()).toBeNull();
      expect(h.gate.tryEnter("probe")).not.toBeNull();
    });
  });

  describe("a failed request", () => {
    it.each<readonly [PictureFailureReason, boolean, string, boolean]>([
      ["server-error:RATE_LIMITED", true, "failed-retryable", false],
      ["server-error:IMAGE_UNAVAILABLE", true, "failed-retryable", false],
      ["server-error:IMAGE_FAILED", false, "failed-final", true],
      ["timeout", false, "failed-final", true],
      ["network", false, "failed-final", true],
      ["invalid-response", false, "failed-final", true],
    ])("settles %s (retryable %s) as %s", async (reason, retryable, phase, billed) => {
      const h = createHarness();
      h.toDrawing();
      await h.answer({ ok: false, reason, retryable });
      expect(h.driver.state).toEqual({ phase, reason, priorAttemptMayHaveBeenBilled: billed });
      expect(h.gate.heldBy()).toBeNull();
      expect(h.treeListeners.size).toBe(0);
      expect(h.exitListeners.size).toBe(0);
    });

    it("settles a rate limit from the real client as retryable", async () => {
      const send = vi.fn(async () => Response.json(
        { error: { code: "RATE_LIMITED", message: "Matter could not draw this passage just now.", retryable: true } },
        { status: 429 },
      ));
      const h = createHarness({ real: { fetch: send as unknown as typeof fetch } });
      h.toDrawing();
      await vi.waitFor(() => expect(h.driver.state.phase).toBe("failed-retryable"));
      expect(h.driver.state).toEqual({
        phase: "failed-retryable",
        reason: "server-error:RATE_LIMITED",
        priorAttemptMayHaveBeenBilled: false,
      });
      expect(send).toHaveBeenCalledOnce();
    });

    it("treats a rejected request as a final network failure", async () => {
      const h = createHarness();
      h.toDrawing();
      h.pending[0]!.reject(new Error("unexpected"));
      await flush();
      expect(h.driver.state).toEqual({ phase: "failed-final", reason: "network", priorAttemptMayHaveBeenBilled: true });
    });

    it("can try again after a failure with a new id and the passage as it is", async () => {
      const h = createHarness();
      h.toDrawing();
      await h.answer({ ok: false, reason: "server-error:RATE_LIMITED", retryable: true });
      h.driver.arm();
      h.driver.confirm();
      expect(h.driver.state).toMatchObject({ phase: "drawing", requestId: "request-2" });
      expect(requestMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Keep", () => {
    it("retries a picture that could not be saved, at no cost, and commits once", async () => {
      const h = createHarness({ blob: "STORAGE_FULL" });
      const held = await h.toArrived();

      await h.driver.accept();
      expect(h.driver.state).toMatchObject({ phase: "arrived", picture: held, lastAcceptFailure: "not-saved" });
      expect(h.commit).not.toHaveBeenCalled();
      expect(h.cache.has(held.pointer.contentHash)).toBe(true);
      expect(h.treeListeners.size).toBe(1);

      h.putImageBlob.mockImplementation(async () => {
        h.order.push("put-blob");
        return { ok: true, value: "written" } as const;
      });
      await h.driver.accept();
      expect(h.driver.state).toEqual({ phase: "accepted", priorAttemptMayHaveBeenBilled: false });
      expect(h.putImageBlob).toHaveBeenCalledTimes(2);
      expect(h.commit).toHaveBeenCalledOnce();
      expect(h.commit).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: T0, expectedImage: null }));
      expect(requestMock).toHaveBeenCalledOnce();
    });

    it("clears the failure once Keep succeeds, and announces it", async () => {
      const h = createHarness({ blob: "STORAGE_UNAVAILABLE" });
      await h.toArrived();
      await h.driver.accept();
      expect(h.states.at(-1)).toHaveProperty("lastAcceptFailure", "not-saved");
      h.putImageBlob.mockResolvedValue({ ok: true, value: "present" });
      await h.driver.accept();
      expect(h.states.at(-1)).not.toHaveProperty("lastAcceptFailure");
    });

    it("lets the person still discard after a failed Keep", async () => {
      const h = createHarness({ blob: "STORAGE_FULL" });
      await h.toArrived();
      await h.driver.accept();
      h.driver.discard();
      expect(h.driver.state).toEqual({ phase: "discarded", priorAttemptMayHaveBeenBilled: false });
      expect(h.driver.state).not.toHaveProperty("lastAcceptFailure");
    });

    it("runs one Keep at a time", async () => {
      const h = createHarness();
      await h.toArrived();
      const first = h.driver.accept();
      const second = h.driver.accept();
      await Promise.all([first, second]);
      expect(h.putImageBlob).toHaveBeenCalledOnce();
      expect(h.commit).toHaveBeenCalledOnce();
      expect(h.driver.state.phase).toBe("accepted");
    });

    it("refuses Discard while Keep is writing", async () => {
      const h = createHarness();
      await h.toArrived();
      const keeping = h.driver.accept();
      h.driver.discard();
      await keeping;
      expect(h.driver.state.phase).toBe("accepted");
    });

    it("does nothing before a picture has arrived", async () => {
      const h = createHarness();
      await h.driver.accept();
      h.toDrawing();
      await h.driver.accept();
      expect(h.putImageBlob).not.toHaveBeenCalled();
      expect(h.driver.state.phase).toBe("drawing");
    });

    it("goes stale if the passage moves on while the bytes are being written", async () => {
      const h = createHarness();
      await h.toArrived();
      h.putImageBlob.mockImplementationOnce(async () => {
        h.nodes.set(NODE, { text: "edited during the write", updatedAt: T1 });
        h.notifyTree();
        return { ok: true, value: "written" } as const;
      });
      await h.driver.accept();
      expect(h.driver.state.phase).toBe("stale");
      expect(h.cache.snapshot().size).toBe(0);
    });

    it("notices after a failed Keep that the passage moved meanwhile", async () => {
      const h = createHarness({ blob: "STORAGE_FULL" });
      await h.toArrived();
      h.putImageBlob.mockImplementationOnce(async () => {
        h.nodes.set(NODE, { text: "edited during the write", updatedAt: T1 });
        h.notifyTree();
        return { ok: false, code: "STORAGE_FULL" } as const;
      });
      await h.driver.accept();
      expect(h.driver.state).toEqual({ phase: "stale", priorAttemptMayHaveBeenBilled: false });
    });

    describe("every outcome of the store, one row each", () => {
      type Row = readonly [string, HarnessOptions, Partial<PictureDriverState>];
      const rows: readonly Row[] = [
        ["ok", {}, { phase: "accepted" }],
        ["not-saved (full)", { blob: "STORAGE_FULL" }, { phase: "arrived", lastAcceptFailure: "not-saved" }],
        ["not-saved (unavailable)", { blob: "STORAGE_UNAVAILABLE" }, { phase: "arrived", lastAcceptFailure: "not-saved" }],
        ["stale", { commit: "stale" }, { phase: "stale" }],
        ["commit-rejected", { commit: "rejected" }, { phase: "arrived", lastAcceptFailure: "refused" }],
        ["blob-rejected", { blob: "REJECTED" }, { phase: "arrived", lastAcceptFailure: "refused" }],
        ["blob-superseded", { blob: "SUPERSEDED" }, { phase: "arrived", lastAcceptFailure: "refused" }],
        ["a commit that throws", { commit: "throw" }, { phase: "arrived", lastAcceptFailure: "refused" }],
        ["a blob write that throws", { blob: "throw" }, { phase: "arrived", lastAcceptFailure: "refused" }],
      ];

      it.each(rows)("%s", async (_name, options, expected) => {
        const h = createHarness(options);
        const held = await h.toArrived();
        await h.driver.accept();
        expect(h.driver.state).toMatchObject(expected);
        if (expected.phase === "arrived") {
          expect(h.driver.state).toMatchObject({ picture: held });
        }
        expect(h.gate.heldBy()).toBeNull();
        expect(unhandled).toEqual([]);
      });

      it("covers every outcome the store can report", () => {
        expect(Object.keys(PICTURE_ACCEPT_OUTCOMES).sort()).toEqual([
          "blob-rejected", "blob-superseded", "commit-rejected", "not-saved", "ok", "stale",
        ]);
      });
    });
  });

  describe("what the person is told", () => {
    it("never carries passage text in any state, success or failure", async () => {
      const scenarios: ReadonlyArray<readonly [HarnessOptions, (h: Harness) => Promise<void>]> = [
        [{}, async (h) => { h.toDrawing(); await h.answer({ ok: true, picture: picture(1) }); await h.driver.accept(); }],
        [{}, async (h) => { h.toDrawing(); h.pending[0]!.reject(new Error(`relay echoed ${PASSAGE}`)); await flush(); }],
        [{}, async (h) => { h.toDrawing(); await h.answer({ ok: false, reason: "invalid-response", retryable: false }); }],
        [{}, async (h) => { h.toDrawing(); h.edit(NODE, { text: `${PASSAGE}!`, updatedAt: T1 }); }],
        [{}, async (h) => { h.toDrawing(); h.driver.stopWaiting(); }],
        [{ commit: "throw" }, async (h) => { await h.toArrived(); await h.driver.accept(); }],
        [{ blob: "throw" }, async (h) => { await h.toArrived(); await h.driver.accept(); }],
        [{ blob: "STORAGE_FULL" }, async (h) => { await h.toArrived(); await h.driver.accept(); }],
        [{ gate: occupiedGate() }, async (h) => { h.driver.arm(); h.driver.confirm(); }],
      ];
      for (const [options, run] of scenarios) {
        const h = createHarness(options);
        await run(h);
        expect(h.states.length).toBeGreaterThan(0);
        for (const state of [...h.states, h.driver.state]) {
          expect(serialise(state)).not.toContain("SECRET-PASSAGE");
          expect(serialise(state)).not.toContain("brother");
        }
      }
    });

    it("exposes bytes only in the arrived state", async () => {
      const h = createHarness();
      await h.toArrived();
      await h.driver.accept();
      for (const state of h.states) {
        expect("picture" in state).toBe(state.phase === "arrived");
      }
    });

    it("survives a listener that throws", async () => {
      const h = createHarness({ throwingListener: true });
      h.toDrawing();
      expect(h.driver.state.phase).toBe("drawing");
      await h.arrive();
      expect(h.driver.state.phase).toBe("arrived");
      await h.driver.accept();
      expect(h.driver.state.phase).toBe("accepted");
      expect(h.gate.heldBy()).toBeNull();
    });
  });
});

function occupiedGate(): PictureInFlightGate {
  const gate = createPictureInFlightGate();
  gate.tryEnter(OTHER);
  return gate;
}

function serialise(state: PictureDriverState): string {
  return JSON.stringify(state, (_key, value: unknown) =>
    value instanceof Uint8Array ? `[${value.byteLength} bytes]` : value);
}

function picture(seed: number, length = 300): GeneratedPicture {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = (index * 31 + seed * 17 + length) % 251;
  return {
    bytes,
    pointer: {
      mediaType: "image/png",
      byteLength: length,
      width: 512,
      height: 384,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function png(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 2;
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return new Uint8Array(Buffer.concat([header, iend]));
}

function imageResponse(bytes: Uint8Array): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(bytes.byteLength),
      [IMAGE_RESPONSE_HEADERS.width]: "512",
      [IMAGE_RESPONSE_HEADERS.height]: "384",
      [IMAGE_RESPONSE_HEADERS.sha256]: createHash("sha256").update(bytes).digest("hex"),
    },
  });
}
