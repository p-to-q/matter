import type { MaterialLexicalRequest } from "./material-lexical-port";

export type MaterialLexicalObservationPort = Readonly<{
  observeCommitted: (request: MaterialLexicalRequest) => void;
}>;

export const IDENTITY_MATERIAL_LEXICAL_OBSERVATION_PORT:
MaterialLexicalObservationPort = Object.freeze({
  observeCommitted: () => undefined,
});

/** Background learning can never reject or delay a material commit. */
export function observeCommittedMaterialText(
  port: MaterialLexicalObservationPort,
  request: MaterialLexicalRequest,
): void {
  try {
    port.observeCommitted(Object.freeze({
      locale: request.locale,
      channel: request.channel,
      text: request.text,
      ...(request.eligibleRanges === undefined
        ? {}
        : { eligibleRanges: Object.freeze(request.eligibleRanges.map((range) =>
            Object.freeze({ ...range }))) }),
    }));
  } catch {
    // Observation is optional background evidence and cannot fail a commit.
  }
}
