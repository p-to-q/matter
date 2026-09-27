import type { MaterialLexicalRequest } from "./material-lexical-port";

export type MaterialLexicalObservation = Readonly<{
  /** Raw human input before the captured lexical basis changes it. */
  observed: MaterialLexicalRequest;
  /** Exact text that was accepted into material after lexical canonicalization. */
  committed: MaterialLexicalRequest;
}>;

export type MaterialLexicalObservationPort = Readonly<{
  observeCommitted: (observation: MaterialLexicalObservation) => void;
}>;

export const IDENTITY_MATERIAL_LEXICAL_OBSERVATION_PORT:
MaterialLexicalObservationPort = Object.freeze({
  observeCommitted: () => undefined,
});

/** Background learning can never reject or delay a material commit. */
export function observeCommittedMaterialText(
  port: MaterialLexicalObservationPort,
  observed: MaterialLexicalRequest,
  committed: MaterialLexicalRequest = observed,
): void {
  try {
    port.observeCommitted(Object.freeze({
      observed: ownObservationRequest(observed),
      committed: ownObservationRequest(committed),
    }));
  } catch {
    // Observation is optional background evidence and cannot fail a commit.
  }
}

function ownObservationRequest(request: MaterialLexicalRequest): MaterialLexicalRequest {
  return Object.freeze({
      locale: request.locale,
      channel: request.channel,
      text: request.text,
      ...(request.eligibleRanges === undefined
        ? {}
        : { eligibleRanges: Object.freeze(request.eligibleRanges.map((range) =>
            Object.freeze({ ...range }))) }),
    });
}
