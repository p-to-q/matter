"use client";

import { useContext, useEffect } from "react";
import {
  pictureAvailabilityWarmWanted,
  warmPictureAvailability,
} from "./picture-availability-timing";
import { PictureAuthoringContext } from "./picture-authoring-context";
import { PICTURE_SHARED } from "./picture-shared";

/**
 * Asks the app's one memoised availability question as soon as a passage shows
 * the mark that opens Point and Talk (hovered, focused, or selected), so the
 * answer is normally known before the field opens and its row never has to
 * change after it has (`picture-availability-timing.ts` has the rules).
 */
export function usePictureAvailabilityWarm(markShown: boolean): void {
  const hasPictureStore = useContext(PictureAuthoringContext) !== null;
  const wanted = pictureAvailabilityWarmWanted({ markShown, hasPictureStore });
  useEffect(() => {
    if (wanted) warmPictureAvailability(PICTURE_SHARED.availability);
  }, [wanted]);
}
