import { repairAdmittedTranscript } from "../runtime/transcript-punctuation";
import type { MatterLocale } from "../config/locales";

export type LocalTranscriptRepairInput = Readonly<{
  text: string;
  locale: MatterLocale;
  vocabulary: readonly string[];
  signal: AbortSignal;
}>;

export type LocalTranscriptRepairResult = Readonly<{
  text: string;
  source: "rules" | "local-model";
}>;

/**
 * The browser composition boundary for late transcript repair. Today it owns
 * the deterministic floor only. A cached worker model may replace or compose
 * with this port later without giving React, the store, or the tree engine any
 * knowledge of model downloads, runtimes, or device capability.
 */
export type LocalTranscriptRepairPort = Readonly<{
  repair: (input: LocalTranscriptRepairInput) => Promise<LocalTranscriptRepairResult>;
  dispose: () => void;
}>;

export function createLocalTranscriptRepairPort(): LocalTranscriptRepairPort {
  return Object.freeze({
    repair: async (input) => {
      if (input.signal.aborted) throw input.signal.reason;
      const text = repairAdmittedTranscript(input.text, input.locale);
      if (input.signal.aborted) throw input.signal.reason;
      return Object.freeze({ text, source: "rules" as const });
    },
    dispose: () => undefined,
  });
}
