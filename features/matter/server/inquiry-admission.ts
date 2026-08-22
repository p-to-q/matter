import {
  createPublicRequestAdmission,
  type PublicRequestAdmission,
} from "./public-request-admission";

export type InquiryAdmission = PublicRequestAdmission;

/**
 * Keeps the established inquiry port while sharing the same process-local
 * perimeter as every other public body route. Deployment infrastructure still
 * owns distributed limits because serverless instances share no memory.
 */
const inquiryAdmission = createPublicRequestAdmission({
  requestsPerWindow: 12,
  maxConcurrent: 4,
});

export function admitInquiryRequest(
  request: Request,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now: () => number = Date.now,
): InquiryAdmission {
  return inquiryAdmission.admit(request, environment, now);
}

export function resetInquiryAdmissionForTests(): void {
  inquiryAdmission.resetForTests();
}
