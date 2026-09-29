import { MATTER_LOCALES, type MatterLocale } from "../config/locales";
import type { WikiBasis } from "../wiki/wiki-basis";
import type { CompiledWikiView } from "../wiki/wiki-compiler";
import {
  WIKI_FITTING_VERSION,
  type WikiChannel,
} from "../wiki/wiki-model";
import type { WikiTextCanonicalizer } from "../application/wiki-material-lexical-adapter";

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
const EMPTY_VIEWS = emptyLocaleRecords(emptyChannelViews);
const EMPTY_SNAPSHOT = Object.freeze({
  generation: 0,
  rules: Object.freeze([]),
  views: EMPTY_VIEWS,
  stats: Object.freeze({
    ruleCount: 0,
    trieNodeCount: MATTER_LOCALES.length * 2,
    totalCodePoints: 0,
  }),
});

const EMPTY_WIKI_BASIS: WikiBasis = Object.freeze({
  stateRevision: 0,
  snapshot: EMPTY_SNAPSHOT,
  confirmedSnapshot: EMPTY_SNAPSHOT,
  fitSnapshot: Object.freeze({
    fittingVersion: WIKI_FITTING_VERSION,
    qualifiedProducerReleases: Object.freeze([]),
    identities: Object.freeze([]),
    buckets: emptyLocaleRecords(() => Object.freeze({})),
    stats: Object.freeze({
      eligibleLexemeCount: 0,
      bucketCount: 0,
      overflowBucketCount: 0,
    }),
  }),
});

type MatterWikiBasisPublication = {
  current: WikiBasis;
  /** The code that interprets a published basis; absent until the lazy runtime binds it. */
  canonicalize?: WikiTextCanonicalizer;
};
// The key versions the in-memory basis ABI across Fast Refresh. A stale cell
// must never survive a required snapshot-shape change.
// v6: the cell also carries the interpreter bound before any rule is published.
const PUBLICATION_KEY = Symbol.for("ptoq.matter.wiki-basis-bridge.v6");
const publicationHost = globalThis as unknown as {
  [key: symbol]: MatterWikiBasisPublication | undefined;
};
const publication = publicationHost[PUBLICATION_KEY] ?? { current: EMPTY_WIKI_BASIS };
publicationHost[PUBLICATION_KEY] = publication;

type PublishCompiledResult =
  | Readonly<{ ok: true; basis: WikiBasis }>
  | Readonly<{
    ok: false;
    error: Readonly<{ code: "STALE_GENERATION"; message: string }>;
  }>;

/** A port that may publish rules, obtainable only together with their interpreter. */
export type MatterWikiBasisPublisher = Readonly<{
  read(): WikiBasis;
  publishCompiled(basis: WikiBasis): PublishCompiledResult;
}>;

const readPublishedBasis = (): WikiBasis => publication.current;

function publishCompiled(basis: WikiBasis): PublishCompiledResult {
  if (basis.snapshot.generation <= publication.current.snapshot.generation) {
    return Object.freeze({
      ok: false as const,
      error: Object.freeze({
        code: "STALE_GENERATION" as const,
        message: "A Wiki basis generation must advance monotonically.",
      }),
    });
  }
  publication.current = basis;
  return Object.freeze({ ok: true as const, basis });
}

/**
 * The initial material graph reads one tiny cell while the durable runtime and
 * the canonicalizer that interprets its rules stay lazy. Nothing outside
 * `bindInterpreter` can publish a basis, so every non-empty basis a reader sees
 * was published after its interpreter: a reader that finds no interpreter can
 * only be looking at the empty basis, which changes no text.
 */
export const matterWikiBasisPublication = Object.freeze({
  read: readPublishedBasis,
  readInterpreter: (): WikiTextCanonicalizer | null => publication.canonicalize ?? null,
  bindInterpreter(canonicalize: WikiTextCanonicalizer): MatterWikiBasisPublisher {
    publication.canonicalize = canonicalize;
    return Object.freeze({ read: readPublishedBasis, publishCompiled });
  },
});
