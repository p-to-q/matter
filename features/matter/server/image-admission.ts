import {
  createPublicRequestAdmission,
  type PublicRequestAdmission,
} from "./public-request-admission";
import { imageSurfaceMode } from "./image-surface";

/**
 * The image route's own bucket, shared with no other route. One generation is
 * paid for by the platform and costs two orders of magnitude more than a text
 * call, so it must neither borrow the transform budget nor drain it: a person
 * who generates three pictures should still be able to swap text.
 *
 * These numbers limit one warm instance and nothing more. Serverless instances
 * share no memory, so they are NOT a distributed spend control and must not be
 * multiplied by an assumed replica count to infer a global ceiling. Spend is
 * protected by the surface gate shipping closed and by an edge rule and a
 * provider budget outside this repository.
 *
 * The shared perimeter meters only when NODE_ENV is "production", because
 * fixture and development traffic shares one process and often no forwarded
 * identity. That is the right default for text and the wrong one here: a
 * staging deployment that runs NODE_ENV=something-else with the live gate open
 * is a paid surface with no rate limit and no origin check. So a live gate is
 * always metered, whatever the build calls itself.
 */
const imageAdmission = createPublicRequestAdmission({
  requestsPerWindow: 3,
  maxConcurrent: 2,
  metered: (environment) =>
    imageSurfaceMode(environment) === "live" || environment.NODE_ENV === "production",
});

export function admitImageRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now: () => number = Date.now,
): PublicRequestAdmission {
  return imageAdmission.admit(request, environment, now);
}

export function resetImageAdmissionForTests(): void {
  imageAdmission.resetForTests();
}
