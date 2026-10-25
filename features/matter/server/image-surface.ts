import { readImagePool, readModelPool } from "./model-pool";

/**
 * Whether the image surface is on, and how. The one owner of that answer: the
 * route decides whether to serve from it and the health route reports from it,
 * so the two cannot disagree about a surface that costs real money per call.
 *
 * ```text
 * MATTER_IMAGE_ADAPTER=live      the configured image relay, paid per generation
 * MATTER_IMAGE_ADAPTER=fixture   a canned result; never in production
 * unset or "off"                 closed
 * ```
 *
 * Unset is closed in production and a fixture elsewhere, the same shape the
 * label and repair gates use. Fixture is refused in production even when asked
 * for: a canned image there would be a surface that looks open and proves
 * nothing, and the only effect of allowing it would be to make a misconfigured
 * deployment look healthy.
 */
export type ImageSurfaceMode = "live" | "fixture" | "off";

export function imageSurfaceMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ImageSurfaceMode {
  const configured = environment.MATTER_IMAGE_ADAPTER;
  const production = environment.NODE_ENV === "production";
  if (configured === "live") return "live";
  if (configured === "fixture" || (configured === undefined && !production)) {
    return production ? "off" : "fixture";
  }
  return "off";
}

/**
 * Whether a live request could actually run: the image relay is configured
 * *and* the chat pool is, because the text step that turns a passage into a
 * brief runs there. Configuration being present is not evidence a relay
 * answers, and health says so for every other surface too.
 */
export function imageSurfaceConfigured(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return readImagePool(environment).length > 0 && readModelPool(environment).length > 0;
}
