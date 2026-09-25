import { MATTER_LOCALES, type MatterLocale } from "../config/locales";
import type { WikiBasis } from "../wiki/wiki-basis";
import type { CompiledWikiView } from "../wiki/wiki-compiler";
import {
  WIKI_FITTING_VERSION,
  type WikiChannel,
  type WikiObserveEvidenceEvent,
} from "../wiki/wiki-model";

export const matterWikiFittingMode =
  process.env.NEXT_PUBLIC_MATTER_WIKI_FITTING === "latin-conservative"
    ? "latin-conservative" as const
    : "off" as const;

const EMPTY_VIEW: CompiledWikiView = Object.freeze({
  nodes: Object.freeze([Object.freeze({
    edges: Object.freeze({}),
    terminalRuleIndex: null,
  })]),
  ruleCount: 0,
  maxFormGraphemes: 0,
});
const emptyChannelViews = (): Readonly<Record<WikiChannel, CompiledWikiView>> =>
  Object.freeze({ spoken: EMPTY_VIEW, written: EMPTY_VIEW });
const emptyLocaleRecords = <T>(factory: () => T): Readonly<Record<MatterLocale, T>> =>
  Object.freeze(Object.fromEntries(MATTER_LOCALES.map((locale) => [locale, factory()])) as
    Record<MatterLocale, T>);

const EMPTY_WIKI_BASIS: WikiBasis = Object.freeze({
  stateRevision: 0,
  snapshot: Object.freeze({
    generation: 0,
    rules: Object.freeze([]),
    views: emptyLocaleRecords(emptyChannelViews),
    stats: Object.freeze({ ruleCount: 0, trieNodeCount: MATTER_LOCALES.length * 2, totalCodePoints: 0 }),
  }),
  fitSnapshot: Object.freeze({
    fittingVersion: WIKI_FITTING_VERSION,
    identities: Object.freeze([]),
    buckets: emptyLocaleRecords(() => Object.freeze({})),
    stats: Object.freeze({ eligibleLexemeCount: 0, bucketCount: 0, overflowBucketCount: 0 }),
  }),
});

type MatterWikiBasisBridge = { current: WikiBasis };
const BRIDGE_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v1");
const bridgeHost = globalThis as unknown as {
  [key: symbol]: MatterWikiBasisBridge | undefined;
};
const bridge = bridgeHost[BRIDGE_KEY] ?? { current: EMPTY_WIKI_BASIS };
bridgeHost[BRIDGE_KEY] = bridge;

/** The initial material graph reads one tiny cell while the durable runtime stays lazy. */
export const matterWikiBasisPublication = Object.freeze({
  read: (): WikiBasis => bridge.current,
  publishCompiled(basis: WikiBasis) {
    if (basis.snapshot.generation <= bridge.current.snapshot.generation) {
      return Object.freeze({
        ok: false as const,
        error: Object.freeze({
          code: "STALE_GENERATION" as const,
          message: "A Wiki basis generation must advance monotonically.",
        }),
      });
    }
    bridge.current = basis;
    return Object.freeze({ ok: true as const, basis });
  },
});

export const readMatterWikiBasis = matterWikiBasisPublication.read;

/** A successful human turn may wake the local runtime, but never waits for it. */
export function observeMatterWikiEvidence(
  events: readonly WikiObserveEvidenceEvent[],
): void {
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiEvidence: observe }) => observe(events))
    .catch(() => undefined);
}
