import type {
  ImageSurfaceAvailability,
  ImageSurfaceAvailabilityCache,
} from "../interaction/image-surface-availability";

/**
 * When the picture control's availability is asked, and when it is heard. The
 * answer must be known before the field opens and must never change what an
 * open field shows, so asking and hearing are two moments:
 *
 * - asked as soon as the mark that opens the field is shown, and never on page
 *   load alone (a person who addresses no passage causes no request);
 * - heard once, when a field opens, from the newest answer the page has had.
 *
 * The memo behind both shares one read among all callers and remembers even a
 * closed answer for its window, so a closed deployment costs one cheap health
 * request a minute at most, never one per click.
 */

/** The mark is shown on a passage this app can draw into: only then is the answer worth a request. */
export function pictureAvailabilityWarmWanted(input: Readonly<{
  markShown: boolean;
  hasPictureStore: boolean;
}>): boolean {
  return input.markShown && input.hasPictureStore;
}

/** Starts (or joins) the one read. The result is for the next opening, not for any open field. */
export function warmPictureAvailability(cache: Pick<ImageSurfaceAvailabilityCache, "get">): void {
  void cache.get();
}

/**
 * What an opening decides its row from, once: the newest answer, however old,
 * so a minute-old answer never makes the control come and go between two
 * openings. Without a picture store there is nothing to draw into.
 */
export function pictureOpeningAvailability(
  cache: Pick<ImageSurfaceAvailabilityCache, "lastKnown">,
  hasPictureStore: boolean,
): ImageSurfaceAvailability {
  return hasPictureStore ? cache.lastKnown() : "unavailable";
}
