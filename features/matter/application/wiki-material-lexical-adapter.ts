import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import type { WikiBasis } from "../wiki/wiki-basis";
import type {
  MaterialLexicalPort,
  MaterialLexicalSuggestion,
  MaterialLexicalSession,
} from "./material-lexical-port";
import type { MaterialLexicalObservationPort } from "./material-lexical-observation-port";
import type { MaterialLexicalObservation } from "./material-lexical-observation-port";

export type WikiConsumptionPolicy = Readonly<{
  phoneticFittingEnabled?: () => boolean;
}>;

export type WikiCommittedObservationSink = (
  observation: MaterialLexicalObservation,
) => void;

/**
 * Adapts Wiki's compiled basis to the only lexical capability Matter consumes.
 * Capturing closes over one immutable basis for the complete material turn.
 */
export function createWikiMaterialLexicalPort(
  readBasis: () => WikiBasis,
  policy: WikiConsumptionPolicy = Object.freeze({}),
): MaterialLexicalPort {
  return Object.freeze({
    capture(): MaterialLexicalSession {
      const basis = readBasis();
      const snapshot = policy.phoneticFittingEnabled?.() === false
        ? basis.confirmedSnapshot
        : basis.snapshot;
      return Object.freeze({
        snapshot: Object.freeze({
          generation: snapshot.generation,
          sourceRevision: basis.stateRevision,
        }),
        canonicalize: (request): MaterialLexicalSuggestion => {
          const result = canonicalizeWikiText(
            snapshot,
            request.locale,
            request.channel,
            request.text,
            { eligibleRanges: request.eligibleRanges },
          );
          if (result.status !== "changed") {
            return Object.freeze({ status: "unchanged" });
          }
          const patches = result.edits.map((edit) => {
            const rule = snapshot.rules[edit.ruleIndex];
            return Object.freeze({
              start: edit.start,
              end: edit.end,
              replacement: rule.canonical,
            });
          });
          return Object.freeze({
            status: "changed",
            patches: Object.freeze(patches),
          });
        },
      });
    },
  });
}

/** Write capability exposed only to the successful human-admission owner. */
export function createWikiMaterialLexicalObservationPort(
  observeCommitted: WikiCommittedObservationSink,
): MaterialLexicalObservationPort {
  return Object.freeze({
    observeCommitted,
  });
}
