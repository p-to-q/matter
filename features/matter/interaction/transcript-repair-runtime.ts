import type { AdmissionRepairAdjudicator } from "../runtime/admission-repair-adjudication";
import type { TranscriptRepairPort } from "./transcript-repair-port";

type TranscriptRepairRuntime = Readonly<{
  createTranscriptRepairPort: typeof import("./transcript-repair-port").createTranscriptRepairPort;
  adjudicateAdmissionRepair: AdmissionRepairAdjudicator;
}>;

let adjudicator: AdmissionRepairAdjudicator | null = null;
let runtimeLoad: Promise<TranscriptRepairRuntime> | null = null;

/**
 * The late-repair runtime: the deterministic repair floor, its expression
 * decorator, the managed-repair client, and the store's adjudication of a
 * candidate. A repair runs only after an admitted transcript returned from the
 * network, so none of it belongs in the initial graph. It is started after
 * first paint and again when recording starts, and awaited only by a repair.
 * A failed fetch may be attempted again; the repair it would have served is
 * discarded and the admitted words stand, as for any repair failure.
 */
export function loadTranscriptRepairRuntime(): Promise<TranscriptRepairRuntime> {
  if (runtimeLoad === null) {
    const attempt = Promise.all([
      import("./transcript-repair-port"),
      import("../runtime/admission-repair-adjudication"),
    ]).then(([port, adjudication]) => {
      adjudicator = adjudication.adjudicateAdmissionRepair;
      return Object.freeze({
        createTranscriptRepairPort: port.createTranscriptRepairPort,
        adjudicateAdmissionRepair: adjudication.adjudicateAdmissionRepair,
      });
    });
    runtimeLoad = attempt;
    attempt.catch(() => {
      if (runtimeLoad === attempt) runtimeLoad = null;
    });
  }
  return runtimeLoad;
}

/**
 * The adjudicator the store judges a candidate with. It is null only until the
 * runtime loads, and every candidate comes from a port that awaited that load,
 * so no candidate can reach the store before its adjudicator does.
 */
export function readAdmissionRepairAdjudicator(): AdmissionRepairAdjudicator | null {
  return adjudicator;
}

/** The admission driver's repair port; its first repair awaits the runtime. */
export function createLazyTranscriptRepairPort(): TranscriptRepairPort {
  let port: TranscriptRepairPort | null = null;
  return Object.freeze({
    async repair(input) {
      const runtime = await loadTranscriptRepairRuntime();
      port ??= runtime.createTranscriptRepairPort();
      return port.repair(input);
    },
    dispose() {
      port?.dispose();
    },
  });
}
