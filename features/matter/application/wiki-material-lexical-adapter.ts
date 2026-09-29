import type { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import type { WikiBasis } from "../wiki/wiki-basis";
import type { WikiOccurrenceAttribution } from "../wiki/wiki-occurrence-registry";
import type {
  MaterialLexicalChannel,
  MaterialLexicalPort,
  MaterialLexicalSuggestion,
  MaterialLexicalSession,
} from "./material-lexical-port";
import type { MaterialLexicalObservationPort } from "./material-lexical-observation-port";
import type { MaterialLexicalObservation } from "./material-lexical-observation-port";

export type WikiConsumptionPolicy = Readonly<{
  phoneticFittingEnabled?: () => boolean;
  /**
   * Registers one applied rule and returns its opaque random occurrence id,
   * or null when attribution is unavailable. Absent, edits stay unattributed.
   */
  mintOccurrence?: (attribution: WikiOccurrenceAttribution) => string | null;
}>;

/** The code that interprets a compiled basis's rules. */
export type WikiTextCanonicalizer = typeof canonicalizeWikiText;

export type WikiCommittedObservationSink = (
  observation: MaterialLexicalObservation,
) => void;

/**
 * Adapts Wiki's compiled basis to the only lexical capability Matter consumes.
 * Capturing closes over one immutable basis, and the interpreter of its rules,
 * for the complete material turn.
 *
 * The interpreter may arrive later than the basis reader: the product loads it
 * with the lazy Wiki runtime, which binds it before publishing any rule. A
 * basis with no rules changes no text, so a turn captured before then is
 * unchanged without the interpreter's code ever loading.
 */
export function createWikiMaterialLexicalPort(
  readBasis: () => WikiBasis,
  readInterpreter: () => WikiTextCanonicalizer | null,
  policy: WikiConsumptionPolicy = Object.freeze({}),
): MaterialLexicalPort {
  return Object.freeze({
    capture(): MaterialLexicalSession {
      const basis = readBasis();
      const snapshot = policy.phoneticFittingEnabled?.() === false
        ? basis.confirmedSnapshot
        : basis.snapshot;
      const canonicalizeWikiText = snapshot.rules.length === 0 ? null : readInterpreter();
      return Object.freeze({
        snapshot: Object.freeze({
          generation: snapshot.generation,
          sourceRevision: basis.stateRevision,
        }),
        canonicalize: (request): MaterialLexicalSuggestion => {
          // No rule, or (unreachable in the product) rules published without
          // their interpreter: nothing can be applied, and material never waits.
          if (canonicalizeWikiText === null) return Object.freeze({ status: "unchanged" });
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
            const occurrence = mintOccurrence(policy, Object.freeze({
              rule: Object.freeze({
                locale: rule.locale,
                channel: rule.channel,
                boundary: rule.boundary,
                form: rule.form,
                canonical: rule.canonical,
                appliedAtRevision: basis.stateRevision,
              }),
              origin: occurrenceOrigin(request.channel),
            }));
            return Object.freeze({
              start: edit.start,
              end: edit.end,
              replacement: rule.canonical,
              ...(occurrence === null ? {} : { occurrence }),
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

/** Spoken words are the person's admission; written text is generated. */
function occurrenceOrigin(channel: MaterialLexicalChannel): WikiOccurrenceAttribution["origin"] {
  return channel === "spoken" ? "human-admission" : "generated";
}

function mintOccurrence(
  policy: WikiConsumptionPolicy,
  attribution: WikiOccurrenceAttribution,
): string | null {
  if (policy.mintOccurrence === undefined) return null;
  try {
    return policy.mintOccurrence(attribution);
  } catch {
    // Attribution is optional; the edit itself never depends on it.
    return null;
  }
}

/** Write capability exposed only to the successful human-admission owner. */
export function createWikiMaterialLexicalObservationPort(
  observeCommitted: WikiCommittedObservationSink,
): MaterialLexicalObservationPort {
  return Object.freeze({
    observeCommitted,
  });
}
