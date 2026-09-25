import type { MatterScenarioId } from "./harness";

export type MaterialModelScenario = Extract<
  MatterScenarioId,
  "matter-transform" | "matter-text-swap"
>;

const SURFACE_GATES: Readonly<Record<MaterialModelScenario, string>> = Object.freeze({
  "matter-transform": "MATTER_TRANSFORM_SURFACE",
  "matter-text-swap": "MATTER_TEXT_SWAP_SURFACE",
});

/**
 * Product authority and managed-provider promotion are deliberately separate.
 * A public surface may be supplied by a user-owned Model API lease while the
 * managed adapter remains off. Missing, unknown, and non-local environments
 * fail closed; only explicit development and test runtimes keep the fixture path.
 */
export function materialModelSurfaceAuthorized(
  scenario: MaterialModelScenario,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const configured = environment[SURFACE_GATES[scenario]];
  if (configured === "public") return true;
  if (
    configured === undefined
    && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test")
  ) return true;
  return false;
}
