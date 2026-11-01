import { planWikiAdmissionBatch, type WikiAdmissionTurn } from "./wiki-admission";
import { collectCommittedWikiTermsResult } from "./wiki-term-collection";
import { fitCommittedWikiTextResult, type WikiFitSnapshot } from "./wiki-fitting";
import type { WikiAliasEvidenceProducer, WikiTermEvidenceProducer } from "./wiki-learning-policy";

/** Background discovery is loaded by committed human admission, never ingress. */
export function planRuntimeWikiAdmission(
  request: WikiAdmissionTurn,
  fitSnapshot: WikiFitSnapshot,
  permissions: Readonly<{ automaticCollection: boolean; phoneticFitting: boolean }>,
  termProducers: ReadonlySet<WikiTermEvidenceProducer>,
  aliasProducers: ReadonlySet<WikiAliasEvidenceProducer>,
) {
  return planWikiAdmissionBatch(request,
    permissions.automaticCollection ? collectCommittedWikiTermsResult(request.committed, termProducers) : null,
    permissions.phoneticFitting ? fitCommittedWikiTextResult(fitSnapshot, request.observed, aliasProducers) : null);
}
Object.defineProperty(planRuntimeWikiAdmission, "matterCapability", { value: "matter-capability:wiki-admission-producers" });
