import {
  createImageAvailabilityCache,
  readImageAvailability,
} from "../interaction/image-availability-read";
import { createPictureInFlightGate } from "../interaction/picture-in-flight-gate";

/**
 * The page's one availability memo and one in-flight gate: both are facts about
 * the whole app, not about one passage or one opening. They live with the lazy
 * Point and Talk chunk, which loads once, so the initial bundle carries neither.
 */
export const PICTURE_SHARED = Object.freeze({
  availability: createImageAvailabilityCache({ read: () => readImageAvailability() }),
  gate: createPictureInFlightGate(),
});
