import { clientMatterBasePath } from "../config/base-path";
import { BRANCH_TIMEOUT_MS, parseBranchAnswer, parseBranchRequest, type BranchRequest } from "../protocol/branch-contract";
import { installBranchIngress } from "./branch-ingress-runtime";
import { prepareBranchIngress } from "../application/branch-ingress";
import { readBoundedJsonResponse } from "./bounded-json-response";

export async function requestBranch(input: BranchRequest, signal: AbortSignal) {
  if (signal.aborted || parseBranchRequest(input) === null) throw new Error("INVALID_BRANCH_REQUEST");
  if (signal.aborted) throw new Error("BRANCH_CANCELLED");
  installBranchIngress(prepareBranchIngress);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(BRANCH_TIMEOUT_MS)]);
  const response = await fetch(`${clientMatterBasePath()}/api/branch`, {
    method: "POST", credentials: "same-origin", cache: "no-store", signal: deadline,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!response.ok) { void response.body?.cancel().catch(() => undefined); throw new Error("BRANCH_UNAVAILABLE"); }
  const answer = parseBranchAnswer(await readBoundedJsonResponse(response, 4096, deadline), input);
  if (answer === null) throw new Error("INVALID_BRANCH_ANSWER");
  return answer;
}
Object.defineProperty(requestBranch, "matterCapability", { value: "matter-capability:branch-client" });
