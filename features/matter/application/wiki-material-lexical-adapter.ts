import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import { fitCommittedWikiText } from "../wiki/wiki-fitting";
import type { WikiBasis } from "../wiki/wiki-basis";
import type { WikiObserveEvidenceEvent } from "../wiki/wiki-model";
import type {
  MaterialLexicalPort,
  MaterialLexicalSuggestion,
  MaterialLexicalSession,
} from "./material-lexical-port";
import type { MaterialLexicalObservationPort } from "./material-lexical-observation-port";

export type WikiFittingPolicy = Readonly<{
  mode: "off" | "latin-conservative";
}>;

/**
 * Adapts Wiki's compiled basis to the only lexical capability Matter consumes.
 * Capturing closes over one immutable basis for the complete material turn.
 */
export function createWikiMaterialLexicalPort(
  readBasis: () => WikiBasis,
): MaterialLexicalPort {
  return Object.freeze({
    capture(): MaterialLexicalSession {
      const basis = readBasis();
      return Object.freeze({
        snapshot: Object.freeze({
          generation: basis.snapshot.generation,
          sourceRevision: basis.stateRevision,
        }),
        canonicalize: (request): MaterialLexicalSuggestion => {
          const result = canonicalizeWikiText(
            basis.snapshot,
            request.locale,
            request.channel,
            request.text,
            { eligibleRanges: request.eligibleRanges },
          );
          if (result.status !== "changed") {
            return Object.freeze({ status: "unchanged" });
          }
          return Object.freeze({
            status: "changed",
            patches: Object.freeze(result.edits.map((edit) => Object.freeze({
              start: edit.start,
              end: edit.end,
              replacement: basis.snapshot.rules[edit.ruleIndex].canonical,
            }))),
          });
        },
      });
    },
  });
}

/** Write capability exposed only to the successful human-admission owner. */
export function createWikiMaterialLexicalObservationPort(
  readBasis: () => WikiBasis,
  observeEvidence: (events: readonly WikiObserveEvidenceEvent[]) => void,
  policy: WikiFittingPolicy,
): MaterialLexicalObservationPort {
  return Object.freeze({
    observeCommitted: (request) => {
      const events = policy.mode === "latin-conservative"
        ? fitCommittedWikiText(readBasis().fitSnapshot, request)
        : Object.freeze([]);
      // An empty batch still advances the bounded human-turn aging clock.
      observeEvidence(events);
    },
  });
}
