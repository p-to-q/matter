import {
  createPublicRequestAdmission,
  type PublicRequestAdmission,
} from "./public-request-admission";

export type TransformAdmission = PublicRequestAdmission;

/**
 * Keeps the transform port's own narrower budget while sharing the one
 * process-local perimeter every other public body route uses. A hand-rolled
 * copy previously admitted `sec-fetch-site: same-site` and left a refused
 * request's body unreleased, so the two generative ports were the weakest
 * public edge in the application. Deployment infrastructure still owns
 * distributed limits because serverless instances share no memory.
 */
const transformAdmission = createPublicRequestAdmission({
  requestsPerWindow: 8,
  maxConcurrent: 3,
});

export function admitTransformRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now: () => number = Date.now,
): TransformAdmission {
  return transformAdmission.admit(request, environment, now);
}

export function resetTransformAdmissionForTests(): void {
  transformAdmission.resetForTests();
}
