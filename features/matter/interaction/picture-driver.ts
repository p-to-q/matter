import type { MatterLocale } from "../config/locales";
import {
  IMAGE_REQUEST_VERSION,
  parseImageRequestEnvelope,
  type ImageRequestEnvelope,
} from "../protocol/image-contract";
import {
  createPictureTurnState,
  ownsPictureRequest,
  reducePictureTurn,
  type GeneratedPicture,
  type PictureTurnEffect,
  type PictureTurnEvent,
  type PictureTurnState,
} from "../runtime/picture-turn";
import type { ImageBlobRepository } from "../persistence/image-blob-repository";
import { equalImagePointers, type ImagePointer } from "../tree/image-pointer";
import { PROTOCOL_VERSION } from "../tree/model";
import {
  acceptPicture,
  type AcceptPictureResult,
  type PictureCommit,
} from "./accept-picture";
import type { PageExit } from "./page-suspension";
import { requestPicture, type PictureRequestResult } from "./picture-client";
import type { PictureInFlightGate } from "./picture-in-flight-gate";
import type { PictureSessionCache } from "./picture-session-cache";

/** What the driver reads of the passage; a tree node satisfies it as it is. */
export type PictureNodeView = Readonly<{
  text: string;
  updatedAt: string;
  image?: ImagePointer;
}>;

export type PictureVisibilityPort = Readonly<{
  isVisible(): boolean;
  /** Calls back when visibility may have changed; never on subscribe itself. */
  subscribe(listener: () => void): () => void;
}>;

/**
 * Keep failed without ending the turn, so the picture stays on screen and
 * Discard stays available. `not-saved`: the bytes could not be made durable;
 * they are held in the session and Keep may be tried again at no cost.
 * `refused`: the store or the engine declined this picture, and Keep would be
 * declined again.
 */
export type PictureAcceptFailure = "not-saved" | "refused";

/** The reducer's state, plus the one fact the reducer has no phase for. */
export type PictureDriverState = PictureTurnState &
  Readonly<{ lastAcceptFailure?: PictureAcceptFailure }>;

export type PictureDriverDependencies = Readonly<{
  /** The one passage this driver draws for. */
  nodeId: string;
  getNode: (nodeId: string) => PictureNodeView | undefined;
  /** Calls back after any tree change; returns the unsubscribe. */
  subscribeTree: (listener: () => void) => () => void;
  documentEpoch: () => number;
  /** Client-only; never persisted, never part of material. */
  mintRequestId: () => string;
  /** Read once, at confirm. */
  locale: () => MatterLocale;
  commit: PictureCommit;
  blobRepository: Pick<ImageBlobRepository, "putImageBlob">;
  cache: PictureSessionCache;
  fetch?: typeof fetch;
  inFlightGate: PictureInFlightGate;
  visibility: PictureVisibilityPort;
  /** A real unload ends the wait; a back-forward-cache hide does not. */
  subscribePageExit: (onExit: (exit: PageExit) => void) => () => void;
  /** Called after every change. Receives the same object as `state`. */
  onState: (state: PictureDriverState) => void;
}>;

type AcceptOutcomeKey = "ok" | Extract<AcceptPictureResult, { ok: false }>["reason"];
type AcceptOutcome =
  | Readonly<{ event: "accept" | "stale" }>
  | Readonly<{ stays: PictureAcceptFailure }>;

/**
 * How Keep's result returns to the turn. The reducer has no way from `arrived`
 * to a failure, and a refusal is not a stale passage, so a refused Keep leaves
 * the picture where it is and says so. A new reason in `acceptPicture` fails to
 * compile here.
 */
export const PICTURE_ACCEPT_OUTCOMES = Object.freeze({
  ok: { event: "accept" },
  "not-saved": { stays: "not-saved" },
  stale: { event: "stale" },
  "commit-rejected": { stays: "refused" },
  "blob-rejected": { stays: "refused" },
  "blob-superseded": { stays: "refused" },
} as const satisfies Readonly<Record<AcceptOutcomeKey, AcceptOutcome>>);

type Basis = Readonly<{
  documentEpoch: number;
  text: string;
  updatedAt: string;
  image: ImagePointer | null;
}>;

type Launch = Readonly<{
  envelope: ImageRequestEnvelope;
  basis: Basis;
  release: () => void;
}>;

type Flight = {
  readonly requestId: string;
  readonly controller: AbortController;
  readonly release: () => void;
  readonly stopWatchingPage: () => void;
  arrival?: GeneratedPicture;
  stopWatchingVisibility?: () => void;
};

/**
 * Executes one passage's picture turn while the reducer stays the only
 * lifecycle authority. The turn is made stale by the passage, never by a
 * timer: the basis taken at confirm is compared with the live node on every
 * tree change, and a settlement that no longer owns the turn is dropped before
 * it can reach the session cache or the store.
 */
export class PictureDriver {
  private turn: PictureTurnState = createPictureTurnState();
  private view: PictureDriverState = this.turn;
  private acceptFailure: PictureAcceptFailure | null = null;
  private basis: Basis | null = null;
  private launch: Launch | null = null;
  private flight: Flight | null = null;
  private stopWatchingTree: (() => void) | null = null;
  private accepting = false;
  private disposed = false;

  constructor(private readonly dependencies: PictureDriverDependencies) {}

  get state(): PictureDriverState {
    return this.view;
  }

  arm(): void {
    this.apply({ type: "arm" });
  }

  back(): void {
    this.apply({ type: "back" });
  }

  confirm(): void {
    if (this.disposed || this.turn.phase !== "arming") return;
    const { nodeId } = this.dependencies;
    const requestId = this.dependencies.mintRequestId();
    const node = this.dependencies.getNode(nodeId);
    const envelope = node === undefined ? null : this.buildEnvelope(requestId, node.text);
    if (node === undefined || envelope === null) {
      this.apply({ type: "stale" });
      return;
    }
    const release = this.dependencies.inFlightGate.tryEnter(nodeId);
    if (release === null) {
      this.refuseSend(requestId);
      return;
    }
    this.launch = Object.freeze({
      envelope,
      release,
      basis: Object.freeze({
        documentEpoch: this.dependencies.documentEpoch(),
        text: node.text,
        updatedAt: node.updatedAt,
        image: node.image ?? null,
      }),
    });
    this.apply({ type: "confirm", requestId });
  }

  /** Ends the wait only. The relay is not told, and a finished picture may still be billed. */
  stopWaiting(): void {
    this.apply({ type: "stop-waiting" });
  }

  /** Keep. Resolves once the turn has settled; it never rejects. */
  async accept(): Promise<void> {
    if (this.disposed || this.accepting || this.turn.phase !== "arrived") return;
    if (!this.basisHolds()) {
      this.apply({ type: "stale" });
      return;
    }
    const basis = this.basis;
    if (basis === null) return;
    // The commit changes the node, so the tree watcher must not read the
    // commit's own mutation as the passage moving on. The store's expected
    // updatedAt and image are what guard this window.
    this.accepting = true;
    let result: AcceptPictureResult;
    try {
      result = await acceptPicture({
        picture: this.turn.picture,
        nodeId: this.dependencies.nodeId,
        expectedUpdatedAt: basis.updatedAt,
        expectedImage: basis.image,
        blobRepository: this.dependencies.blobRepository,
        commit: this.dependencies.commit,
        cache: this.dependencies.cache,
      });
    } catch {
      result = Object.freeze({ ok: false, reason: "commit-rejected" });
    } finally {
      this.accepting = false;
    }
    if (this.disposed) return;
    const outcome = PICTURE_ACCEPT_OUTCOMES[result.ok ? "ok" : result.reason];
    if ("event" in outcome) {
      this.apply({ type: outcome.event });
      return;
    }
    if (!this.basisHolds()) {
      this.apply({ type: "stale" });
      return;
    }
    this.acceptFailure = outcome.stays;
    this.publish();
  }

  discard(): void {
    if (this.accepting) return;
    this.apply({ type: "discard" });
  }

  /** Aborts without state churn; every later callback is a no-op. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flight?.controller.abort(new DOMException("Aborted", "AbortError"));
    this.endFlight();
    this.endBasis();
  }

  private buildEnvelope(requestId: string, text: string): ImageRequestEnvelope | null {
    const parsed = parseImageRequestEnvelope({
      protocolVersion: PROTOCOL_VERSION,
      requestVersion: IMAGE_REQUEST_VERSION,
      id: requestId,
      locale: this.dependencies.locale(),
      passage: { nodeId: this.dependencies.nodeId, text },
    });
    return parsed.ok ? parsed.envelope : null;
  }

  private refuseSend(requestId: string): void {
    const confirmed = reducePictureTurn(this.turn, { type: "confirm", requestId });
    const refused = reducePictureTurn(confirmed.state, {
      type: "failed",
      requestId,
      reason: "another-picture-in-flight",
      retryable: true,
    });
    // The confirm's request effect is dropped on purpose: nothing is sent.
    this.transition(refused.state, []);
  }

  private apply(event: PictureTurnEvent): void {
    if (this.disposed) return;
    const result = reducePictureTurn(this.turn, event);
    if (result.state === this.turn) return;
    this.transition(result.state, result.effects);
  }

  private transition(next: PictureTurnState, effects: readonly PictureTurnEffect[]): void {
    const previous = this.turn;
    this.turn = next;
    for (const effect of effects) {
      if (effect.type === "request-picture") this.startRequest(effect.requestId);
      else this.abortRequest(effect.requestId);
    }
    if (previous.phase === "drawing" && next.phase !== "drawing") this.endFlight();
    if (next.phase !== "drawing" && next.phase !== "arrived") this.endBasis();
    if (next.phase !== "arrived") this.acceptFailure = null;
    this.publish();
  }

  private startRequest(requestId: string): void {
    const launch = this.launch;
    this.launch = null;
    if (launch === null) return;
    const controller = new AbortController();
    const flight: Flight = {
      requestId,
      controller,
      release: launch.release,
      stopWatchingPage: this.dependencies.subscribePageExit((exit) => {
        if (!exit.persisted && this.flight === flight) this.apply({ type: "stop-waiting" });
      }),
    };
    this.flight = flight;
    this.basis = launch.basis;
    this.stopWatchingTree = this.dependencies.subscribeTree(this.onTreeChange);
    const { fetch } = this.dependencies;
    void requestPicture(launch.envelope, {
      signal: controller.signal,
      ...(fetch === undefined ? {} : { fetch }),
    }).then(
      (result) => this.settle(flight, result),
      () => this.settle(flight, Object.freeze({ ok: false, reason: "network", retryable: false })),
    );
  }

  private abortRequest(requestId: string): void {
    if (this.flight?.requestId !== requestId) return;
    this.flight.controller.abort(new DOMException("Aborted", "AbortError"));
  }

  private settle(flight: Flight, result: PictureRequestResult): void {
    if (!this.ownsFlight(flight)) return;
    if (!result.ok) {
      this.apply({
        type: "failed",
        requestId: flight.requestId,
        reason: result.reason,
        retryable: result.retryable,
      });
      return;
    }
    flight.arrival = result.picture;
    if (this.dependencies.visibility.isVisible()) {
      this.deliverArrival(flight);
      return;
    }
    // A picture is not shown to a page nobody is looking at. It waits, still
    // owned and still stale-able, and Keep is never automatic.
    flight.stopWatchingVisibility = this.dependencies.visibility.subscribe(() => {
      this.deliverArrival(flight);
    });
  }

  private deliverArrival(flight: Flight): void {
    const picture = flight.arrival;
    if (
      picture === undefined ||
      !this.ownsFlight(flight) ||
      !this.dependencies.visibility.isVisible()
    ) return;
    flight.arrival = undefined;
    flight.stopWatchingVisibility?.();
    flight.stopWatchingVisibility = undefined;
    if (!this.basisHolds()) {
      this.apply({ type: "stale" });
      return;
    }
    this.apply({ type: "arrived", requestId: flight.requestId, picture });
  }

  private ownsFlight(flight: Flight): boolean {
    return !this.disposed &&
      this.flight === flight &&
      ownsPictureRequest(this.turn, flight.requestId);
  }

  private readonly onTreeChange = (): void => {
    if (this.disposed || this.accepting || this.basis === null) return;
    if (!this.basisHolds()) this.apply({ type: "stale" });
  };

  private basisHolds(): boolean {
    const basis = this.basis;
    if (basis === null || this.dependencies.documentEpoch() !== basis.documentEpoch) return false;
    const node = this.dependencies.getNode(this.dependencies.nodeId);
    return node !== undefined &&
      node.text === basis.text &&
      node.updatedAt === basis.updatedAt &&
      equalImagePointers(node.image, basis.image);
  }

  private endFlight(): void {
    const flight = this.flight;
    if (flight === null) return;
    this.flight = null;
    flight.stopWatchingVisibility?.();
    flight.stopWatchingPage();
    flight.release();
  }

  private endBasis(): void {
    this.basis = null;
    this.stopWatchingTree?.();
    this.stopWatchingTree = null;
  }

  private publish(): void {
    this.view = this.acceptFailure === null
      ? this.turn
      : Object.freeze({ ...this.turn, lastAcceptFailure: this.acceptFailure });
    try {
      this.dependencies.onState(this.view);
    } catch {
      // Observation cannot interrupt the turn's own cleanup or ordering.
    }
  }
}
