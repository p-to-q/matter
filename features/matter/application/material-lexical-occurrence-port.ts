import type { MatterLocale } from "../config/locales";
import type {
  MaterialLexicalChannel,
  MaterialLexicalOccurrenceEdit,
} from "./material-lexical-port";
import type { MaterialIngressStage } from "./material-ingress";

/**
 * The attributed lexical edits of one successful material commit, addressed
 * by the committed node identity and timestamp. `sourceText` in each edit is
 * content: the publication is transient and must not be stored or logged.
 */
export type MaterialLexicalOccurrencePublication = Readonly<{
  treeId: string;
  documentEpoch: number;
  nodeId: string;
  nodeUpdatedAt: string;
  stage: MaterialIngressStage;
  channel: MaterialLexicalChannel;
  locale: MatterLocale;
  edits: readonly MaterialLexicalOccurrenceEdit[];
}>;

/**
 * The store publishes after its state commit, exactly like the committed
 * observation. Composition chooses the consumer; the store never learns it.
 */
export type MaterialLexicalOccurrencePort = Readonly<{
  publishCommitted: (publication: MaterialLexicalOccurrencePublication) => void;
}>;

export const IDENTITY_MATERIAL_LEXICAL_OCCURRENCE_PORT:
MaterialLexicalOccurrencePort = Object.freeze({
  publishCommitted: () => undefined,
});

/** An occurrence consumer can never reject or delay a committed material change. */
export function publishCommittedLexicalOccurrences(
  port: MaterialLexicalOccurrencePort,
  publication: MaterialLexicalOccurrencePublication,
): void {
  try {
    port.publishCommitted(publication);
  } catch {
    // Occurrence presentation and learning are optional after commit.
  }
}
