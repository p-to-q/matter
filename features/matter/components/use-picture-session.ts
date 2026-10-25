"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MatterLocale } from "../config/locales";
import type { ImageSurfaceAvailability } from "../interaction/image-surface-availability";
import { subscribePageExit } from "../interaction/page-suspension";
import { pictureEnvironmentSupported } from "../interaction/picture-environment";
import { PictureDriver, type PictureDriverState } from "../interaction/picture-driver";
import { createPictureTurnState } from "../runtime/picture-turn";
import {
  BROWSER_PICTURE_VISIBILITY,
  createPictureCommit,
  keepPictureGesture,
  mintPictureCommandId,
  mintPictureRequestId,
} from "./picture-authoring";
import { PictureAuthoringContext } from "./picture-authoring-context";
import { pictureOpeningAvailability, warmPictureAvailability } from "./picture-availability-timing";
import { PICTURE_SHARED } from "./picture-shared";
import {
  pictureControlPresentation,
  pictureHold,
  type PictureControlPresentation,
} from "./picture-surface";

export type PointTalkPictureActions = Readonly<{
  arm: () => void;
  confirm: () => void;
  back: () => void;
  stopWaiting: () => void;
  keep: () => void;
  discard: () => void;
  /** A retryable failure returns to the arm step, which repeats any warning. */
  tryAgain: () => void;
  /** Leaves a failure the person will not retry; the next arm still warns. */
  dismissFailure: () => void;
}>;

export type PictureSession = Readonly<{
  state: PictureDriverState;
  control: PictureControlPresentation;
  /** Keep has been pressed and not yet settled. */
  keeping: boolean;
  actions: PointTalkPictureActions;
}>;

/** A press that lands before the driver exists; carried out once, the moment it does. */
class PendingArm {
  private requested = false;
  request(): void {
    this.requested = true;
  }
  take(): boolean {
    const was = this.requested;
    this.requested = false;
    return was;
  }
}

const NO_ACTIONS: PointTalkPictureActions = Object.freeze({
  arm: ignore,
  confirm: ignore,
  back: ignore,
  stopWaiting: ignore,
  keep: ignore,
  discard: ignore,
  tryAgain: ignore,
  dismissFailure: ignore,
});

/**
 * One picture turn for one open Point and Talk session on one passage. Whether
 * the control may arm is decided once, when the session opens, from the newest
 * answer the app's single memo holds (the lens has normally asked already); a
 * read that finishes later is heard by the next opening, so the row never
 * changes under the person's hand. The driver exists only for an `available`
 * opening and is disposed with the session. Null when the app has no picture
 * store.
 */
export function usePictureSession(input: Readonly<{
  nodeId: string;
  locale: MatterLocale;
  documentEpoch: number;
  /** Null when there is no passage text to draw from. */
  passageText: string | null;
  interactionPending: boolean;
}>): PictureSession | null {
  const authoring = useContext(PictureAuthoringContext);
  const { documentEpoch, nodeId } = input;
  // Fixed for this opening: an answer that arrives later applies to the next.
  const [availability] = useState<ImageSurfaceAvailability>(
    () => pictureOpeningAvailability(PICTURE_SHARED.availability, authoring !== null),
  );
  const [driver, setDriver] = useState<PictureDriver | null>(null);
  const [storeFailed, setStoreFailed] = useState(false);
  // A press that lands while the store is still opening waits for it.
  const [pending] = useState(() => new PendingArm());
  const [state, setState] = useState<PictureDriverState>(createPictureTurnState);
  const [keeping, setKeeping] = useState(false);
  // The document's room is a fact about the live tree, so it follows the tree
  // rather than the render that last happened to read it.
  const documentHasRoom = useSyncExternalStore(
    authoring?.subscribeTree ?? SUBSCRIBE_NOTHING,
    () => authoring?.canTakePicture(nodeId) ?? false,
    () => false,
  );
  const environmentSupported = useMemo(() => pictureEnvironmentSupported(globalThis), []);
  const localeRef = useRef(input.locale);
  useLayoutEffect(() => {
    localeRef.current = input.locale;
  });

  // Renews the answer for the next opening (the memo shares one read among
  // every caller and remembers even a closed answer for its window); nothing
  // here changes what this opening shows.
  useEffect(() => {
    if (authoring !== null) warmPictureAvailability(PICTURE_SHARED.availability);
  }, [authoring]);

  useEffect(() => {
    if (authoring === null || availability !== "available") return;
    const owner: { driver: PictureDriver | null } = { driver: null };
    let live = true;
    // The store (session cache, blob connection) is built here, on the first
    // session that can draw, not merely because the discovery entry is visible.
    void authoring.loadStore().then(({ cache, repository }) => {
      if (!live) return;
      const created = new PictureDriver({
        nodeId,
        getNode: authoring.readNode,
        subscribeTree: authoring.subscribeTree,
        documentEpoch: authoring.documentEpoch,
        mintRequestId: mintPictureRequestId,
        locale: () => localeRef.current,
        commit: createPictureCommit({
          attachPicture: authoring.attachPicture,
          documentEpoch,
          mintCommandId: mintPictureCommandId,
          now: () => new Date().toISOString(),
        }),
        blobRepository: repository,
        cache,
        canTakePicture: authoring.canTakePicture,
        environmentSupported: () => pictureEnvironmentSupported(globalThis),
        inFlightGate: PICTURE_SHARED.gate,
        visibility: BROWSER_PICTURE_VISIBILITY,
        subscribePageExit,
        onState: setState,
      });
      owner.driver = created;
      setDriver(created);
      setState(created.state);
      if (pending.take()) created.arm();
    }, () => {
      if (live) setStoreFailed(true);
    });
    return () => {
      live = false;
      pending.take();
      owner.driver?.dispose();
      setDriver(null);
    };
  }, [authoring, availability, documentEpoch, nodeId, pending]);

  const keep = useCallback(() => {
    if (driver === null || authoring === null) return;
    setKeeping(true);
    void keepPictureGesture({
      requestPersistence: authoring.requestPersistence,
      accept: () => driver.accept(),
    }).finally(() => setKeeping(false));
  }, [authoring, driver]);

  const actions = useMemo<PointTalkPictureActions>(() => driver === null ? {
    ...NO_ACTIONS,
    // Before the driver exists, a press is remembered and carried out the moment it does.
    arm: () => pending.request(),
  } : Object.freeze({
    arm: () => driver.arm(),
    confirm: () => driver.confirm(),
    back: () => driver.back(),
    stopWaiting: () => driver.stopWaiting(),
    keep,
    discard: () => driver.discard(),
    tryAgain: () => driver.arm(),
    dismissFailure: () => {
      driver.arm();
      driver.back();
    },
  }), [driver, keep, pending]);

  const control = pictureControlPresentation({
    availability,
    environmentSupported,
    documentHasRoom,
    passageText: input.passageText,
    // The passage's own turn counts: while it draws or previews, the control
    // is there but cannot start another.
    interactionPending: input.interactionPending || pictureHold(state.phase) !== "free",
    storeFailed,
  });
  return useMemo(
    () => authoring === null ? null : Object.freeze({ state, control, keeping, actions }),
    [actions, authoring, control, keeping, state],
  );
}

function ignore(): void {}

function SUBSCRIBE_NOTHING(): () => void {
  return ignore;
}
