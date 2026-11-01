import { BRANCH_VERSION, parseBranchRequest } from "../protocol/branch-contract";
import { withBoundedJsonRequest } from "./bounded-json-request";
import { createPublicRequestAdmission } from "./public-request-admission";
import { ScenarioGovernor, runScenario, type ScenarioAdapter } from "./harness";
import { resolvePoolAdapter, DEFAULT_POOL_LIMITS } from "./model-pool";
import { resolveScenarioRequestModelAdapter } from "./request-model-pool";
import { BRANCH_SCENARIO } from "./branch-harness";

const admission = createPublicRequestAdmission({ requestsPerWindow: 8, maxConcurrent: 2, identity: "platform" });
const governor = new ScenarioGovernor();
class BranchFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export async function handleBranchRequest(request: Request, injected?: ScenarioAdapter | null): Promise<Response> {
  const ticket = admission.admit(request);
  if (!ticket.ok) return failure(ticket.reason === "ORIGIN" ? 403 : 429, "NOT_ADMITTED");
  try {
    return await withBoundedJsonRequest(request, {
      maxBytes: 40 * 1024, timeoutMs: 14_000,
      fail: (reason) => new BranchFailure(reason === "too-large" ? 413 : reason === "timed-out" ? 504 : 400, "INVALID_REQUEST"),
    }, async (payload, signal) => {
      const input = parseBranchRequest(payload);
      if (input === null) throw new BranchFailure(400, "INVALID_REQUEST");
      const adapter = injected === undefined
        ? resolveScenarioRequestModelAdapter(request, "matter-branch", {
          fallback: process.env.MATTER_BRANCH_ADAPTER === "live" ? resolvePoolAdapter(process.env) : null,
          limits: DEFAULT_POOL_LIMITS,
        }).adapter : injected;
      if (adapter === null) throw new BranchFailure(503, "MODEL_UNAVAILABLE");
      const outcome = await runScenario(BRANCH_SCENARIO, input, adapter, governor, { signal });
      if (!outcome.ok) throw new BranchFailure(503, outcome.fallback);
      return Response.json({ version: BRANCH_VERSION, requestId: input.requestId, treeId: input.treeId,
        revision: input.revision, parentId: input.parentId, text: outcome.value }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    return error instanceof BranchFailure ? failure(error.status, error.code) : failure(500, "BRANCH_FAILED");
  } finally { ticket.release(); }
}
function failure(status: number, code: string): Response {
  return Response.json({ version: BRANCH_VERSION, error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
}
