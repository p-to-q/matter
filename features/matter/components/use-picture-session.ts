"use client";

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MatterLocale } from "../config/locales";
import type { ImageSurfaceAvailability } from "../interaction/image-surface-availability";
import { subscribePageExit } from "../interaction/page-suspension";
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
 * One picture turn for one open Point and Talk session on one passage. The
 * availability question is asked when the session opens and answered from the
 * app's single memo; the driver exists only once that answer is `available`,
 * and is disposed with the session. Null when the app has no picture store.
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
  const [availability, setAvailability] = useState<ImageSurfaceAvailability>(
    () => authoring === null ? "unavailable" : PICTURE_SHARED.availability.peek(),
  );
  const [driver, setDriver] = useState<PictureDriver | null>(null);
  const [state, setState] = useState<PictureDriverState>(createPictureTurnState);
  const [keeping, setKeeping] = useState(false);
  const localeRef = useRef(input.locale);
  useLayoutEffect(() => {
    localeRef.current = input.locale;
  });

  useEffect(() => {
    if (authoring === null) return;
    let live = true;
    void PICTURE_SHARED.availability.get().then((answer) => {
      if (live) setAvailability(answer);
    });
    return () => {
      live = false;
    };
  }, [authoring]);

  useEffect(() => {
    if (authoring === null || availability !== "available") return;
    const owner: { driver: PictureDriver | null } = { driver: null };
    let live = true;
    // The store (session cache, blob connection) is built here, on the first
    // session that can draw, not when the app mounts. No control exists until it is.
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
        inFlightGate: PICTURE_SHARED.gate,
        visibility: BROWSER_PICTURE_VISIBILITY,
        subscribePageExit,
        onState: setState,
      });
      owner.driver = created;
      setDriver(created);
      setState(created.state);
    }, () => undefined);
    return () => {
      live = false;
      owner.driver?.dispose();
      setDriver(null);
    };
  }, [authoring, availability, documentEpoch, nodeId]);

  const keep = useCallback(() => {
    if (driver === null || authoring === null) return;
    setKeeping(true);
    void keepPictureGesture({
      requestPersistence: authoring.requestPersistence,
      accept: () => driver.accept(),
    }).finally(() => setKeeping(false));
  }, [authoring, driver]);

  const actions = useMemo<PointTalkPictureActions>(() => driver === null ? NO_ACTIONS : Object.freeze({
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
  }), [driver, keep]);

  const control = pictureControlPresentation({
    availability: driver === null ? "unavailable" : availability,
    passageText: input.passageText,
    // The passage's own turn counts: while it draws or previews, the control
    // is there but cannot start another.
    interactionPending: input.interactionPending || pictureHold(state.phase) !== "free",
  });
  return useMemo(
    () => authoring === null ? null : Object.freeze({ state, control, keeping, actions }),
    [actions, authoring, control, keeping, state],
  );
}

function ignore(): void {}
