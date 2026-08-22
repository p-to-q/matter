import type { MatterLocale } from "../config/locales";
import {
  adjudicateRepair,
  decideRepairRequest,
  normalizeRepairInput,
} from "../material/transcript-repair";
import { decorateSpokenExpression } from "../runtime/expressive-transcript";
import { repairAdmittedTranscriptWords } from "../runtime/transcript-punctuation";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import {
  requestTranscriptRepair,
  transcriptRepairEnabled,
  type RepairRequestInput,
} from "./repair-client";

export type TranscriptRepairInput = Readonly<{
  operationId: string;
  attempt: number;
  text: string;
  locale: MatterLocale;
  vocabulary: readonly string[];
  signal: AbortSignal;
}>;

export type TranscriptRepairResult = Readonly<{
  text: string;
  source: "rules" | "model";
}>;

export type TranscriptRepairPort = Readonly<{
  repair: (input: TranscriptRepairInput) => Promise<TranscriptRepairResult>;
  dispose: () => void;
}>;

type RemoteRepair = (input: RepairRequestInput) => ReturnType<typeof requestTranscriptRepair>;

/**
 * Composes the always-available deterministic floor with one optional managed
 * proposal. The port owns transport fallback only; material authority remains
 * in the store's opaque lease and exact revalidation.
 */
export function createTranscriptRepairPort(options: Readonly<{
  request?: RemoteRepair;
  remoteEnabled?: () => boolean;
}> = {}): TranscriptRepairPort {
  const request = options.request ?? requestTranscriptRepair;
  const remoteEnabled = options.remoteEnabled ?? transcriptRepairEnabled;
  return Object.freeze({
    repair: async (input) => {
      throwIfAborted(input.signal);
      const ruleWords = repairAdmittedTranscriptWords(input.text, input.locale);
      const ruleText = decorateSpokenExpression({
        text: ruleWords,
        locale: input.locale,
        maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
        sampleSeed: input.operationId,
      });
      const rules = Object.freeze({ text: ruleText, source: "rules" as const });
      const ruleInput = normalizeRepairInput({
        text: ruleWords,
        locale: input.locale,
        vocabulary: input.vocabulary,
      });
      if (!remoteEnabled() || !decideRepairRequest(ruleInput)) return rules;

      let response: Awaited<ReturnType<RemoteRepair>>;
      try {
        response = await request({
          operationId: input.operationId,
          attempt: input.attempt,
          locale: input.locale,
          text: ruleWords,
          vocabulary: input.vocabulary,
          signal: input.signal,
        });
      } catch (error) {
        if (input.signal.aborted) throw error;
        return rules;
      }
      throwIfAborted(input.signal);
      if (response.source !== "model" || response.text === ruleWords) return rules;

      // The deterministic floor already owns its closed lexical removals. Judge
      // only the model's delta from that floor; otherwise a safe restart/filler
      // deletion is counted a second time and can hide a valid spelling fix.
      // The durable store recomputes the same floor before doing this again.
      const verdict = adjudicateRepair(
        ruleInput,
        response.text,
      );
      return verdict.ok && verdict.changed
        ? Object.freeze({
            text: decorateSpokenExpression({
              text: verdict.text,
              locale: input.locale,
              maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
              sampleSeed: input.operationId,
            }),
            source: "model" as const,
          })
        : rules;
    },
    dispose: () => undefined,
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Transcript repair was cancelled.", "AbortError");
  }
}
