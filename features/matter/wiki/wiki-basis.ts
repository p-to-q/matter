import { parseWikiState } from "./wiki-codec";
import {
  compileWikiRules,
  type CompiledWikiRule,
  type CompiledWikiSnapshot,
  type WikiCompileIssue,
} from "./wiki-compiler";
import {
  createEmptyWikiState,
  projectApplicableWikiRules,
  WIKI_CONFIRMED_ONLY,
  type WikiProjectionPolicy,
} from "./wiki-evidence";
import {
  compileWikiFitSnapshot,
  wikiFitSnapshotMatchesState,
  type WikiFitSnapshot,
} from "./wiki-fitting";
import type { WikiState, WikiTermEvidenceAggregate } from "./wiki-model";

export type WikiBasis = Readonly<{
  stateRevision: number;
  /** Release-qualified projection selected by the runtime policy. */
  snapshot: CompiledWikiSnapshot;
  /** Human-confirmed fallback used when local fitting permission is paused. */
  confirmedSnapshot: CompiledWikiSnapshot;
  fitSnapshot: WikiFitSnapshot;
}>;

export type CompileWikiBasisResult =
  | Readonly<{ ok: true; basis: WikiBasis }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "INVALID_STATE";
        message: string;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "COMPILE_FAILED";
        message: string;
        issues: readonly WikiCompileIssue[];
      }>;
    }>;

type WikiBasisSource = Readonly<{
  state: WikiState;
  projectionPolicyIdentity: string;
}>;

// Basis provenance is a disposable acceleration receipt, not durable Wiki
// authority. Weak ownership lets a retired publication release its recovery-
// sized state without adding another persistence or invalidation lifecycle.
const wikiBasisSources = new WeakMap<WikiBasis, WikiBasisSource>();

/**
 * Builds the only snapshot that text canonicalization may consume.
 *
 * Parsing first detaches the basis from mutable persistence or event payloads;
 * projection keeps evidence policy out of the matcher; compilation then makes
 * one immutable read sufficient for an entire material operation.
 */
export function compileWikiBasis(
  state: unknown,
  generation: number,
  previousBasis?: WikiBasis,
  projectionPolicy: WikiProjectionPolicy = WIKI_CONFIRMED_ONLY,
): CompileWikiBasisResult {
  const parsed = parseWikiState(state);
  if (!parsed.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: "INVALID_STATE",
        message: parsed.message,
      }),
    });
  }
  if (!Number.isSafeInteger(generation) || generation < 0) {
    // Reuse must preserve the compiler's public failure contract instead of
    // turning an invalid generation into a cloned last-good snapshot.
    const invalidGeneration = compileWikiRules(Object.freeze([]), generation);
    if (invalidGeneration.ok) {
      throw new Error("The Wiki compiler accepted an invalid generation.");
    }
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: "COMPILE_FAILED",
        message: "The applicable Wiki rules could not be compiled.",
        issues: invalidGeneration.issues,
      }),
    });
  }

  const previousSource = previousBasis === undefined
    ? undefined
    : wikiBasisSources.get(previousBasis);
  const projectionPolicyIdentity = wikiProjectionPolicyIdentity(projectionPolicy);
  const projectionUnchanged = previousBasis !== undefined &&
    previousSource !== undefined &&
    previousSource.projectionPolicyIdentity === projectionPolicyIdentity &&
    provisionalProjectionInputsMatch(previousSource.state, parsed.state);
  const compiled = projectionUnchanged
    ? reuseCompiledSnapshot(previousBasis.snapshot, generation)
    : compileWithReuse(
        projectApplicableWikiRules(parsed.state, projectionPolicy),
        generation,
        previousBasis?.snapshot,
      );
  if (!compiled.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: "COMPILE_FAILED",
        message: "The applicable Wiki rules could not be compiled.",
        issues: compiled.issues,
      }),
    });
  }
  const confirmedUnchanged = previousBasis !== undefined &&
    previousSource !== undefined &&
    confirmedProjectionInputsMatch(previousSource.state, parsed.state);
  let confirmed: ReturnType<typeof compileWikiRules>;
  if (!projectionPolicy.includeProvisional) {
    confirmed = compiled;
  } else if (confirmedUnchanged) {
    confirmed = reuseCompiledSnapshot(previousBasis.confirmedSnapshot, generation);
  } else {
    const confirmedApplicable = projectApplicableWikiRules(
      parsed.state,
      WIKI_CONFIRMED_ONLY,
    );
    confirmed = compiledRulesMatch(confirmedApplicable, compiled.snapshot.rules)
      ? compiled
      : compileWithReuse(
          confirmedApplicable,
          generation,
          previousBasis?.confirmedSnapshot,
        );
  }
  if (!confirmed.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: "COMPILE_FAILED",
        message: "The confirmed Wiki rules could not be compiled.",
        issues: confirmed.issues,
      }),
    });
  }

  const fitUnchanged = previousBasis !== undefined &&
    previousSource !== undefined &&
    previousSource.projectionPolicyIdentity === projectionPolicyIdentity &&
    fitInputsMatch(previousSource.state, parsed.state);
  const basis = Object.freeze({
    stateRevision: parsed.state.revision,
    snapshot: compiled.snapshot,
    confirmedSnapshot: confirmed.snapshot,
    fitSnapshot: fitUnchanged
      ? previousBasis.fitSnapshot
      : previousBasis !== undefined &&
          wikiFitSnapshotMatchesState(
            previousBasis.fitSnapshot,
            parsed.state,
            projectionPolicy.qualifiedProducerReleases,
          )
        ? previousBasis.fitSnapshot
        : compileWikiFitSnapshot(
            parsed.state,
            projectionPolicy.qualifiedProducerReleases,
          ),
  });
  wikiBasisSources.set(basis, Object.freeze({
    state: parsed.state,
    projectionPolicyIdentity,
  }));
  return Object.freeze({
    ok: true,
    basis,
  });
}

function wikiProjectionPolicyIdentity(policy: WikiProjectionPolicy): string {
  return JSON.stringify([
    policy.includeProvisional,
    policy.qualifiedProducerReleases.map((release) => [
      release.qualificationVersion,
      release.identity.producerId,
      release.identity.producerVersion,
      release.identity.producerDigest,
      release.identity.resourceId,
      release.identity.resourceVersion,
      release.identity.resourceDigest,
      release.corpus.corpusVersion,
      release.corpus.corpusDigest,
    ]),
  ]);
}

function confirmedProjectionInputsMatch(left: WikiState, right: WikiState): boolean {
  return left.lexemes === right.lexemes && left.authorities === right.authorities;
}

function provisionalProjectionInputsMatch(left: WikiState, right: WikiState): boolean {
  return confirmedProjectionInputsMatch(left, right) &&
    left.automaticLearningSaturated === right.automaticLearningSaturated &&
    left.aliasEvidence === right.aliasEvidence &&
    left.aliasTombstones === right.aliasTombstones &&
    termProjectionInputsMatch(left.termEvidence, right.termEvidence);
}

function fitInputsMatch(left: WikiState, right: WikiState): boolean {
  return left.fittingVersion === right.fittingVersion &&
    left.lexemes === right.lexemes &&
    termProjectionInputsMatch(left.termEvidence, right.termEvidence);
}

function termProjectionInputsMatch(
  left: readonly WikiTermEvidenceAggregate[],
  right: readonly WikiTermEvidenceAggregate[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  // Valid collected rows always retain positive support. Projection and
  // fitting therefore consume identity, producer, and phase; support and quiet
  // cadence may advance without changing either compiled authority.
  return left.every((entry, index) => {
    const candidate = right[index];
    return candidate !== undefined && entry.locale === candidate.locale &&
      entry.canonical === candidate.canonical && entry.producer === candidate.producer &&
      entry.phase === candidate.phase;
  });
}

function reuseCompiledSnapshot(
  previous: CompiledWikiSnapshot,
  generation: number,
): ReturnType<typeof compileWikiRules> {
  return Object.freeze({
    ok: true as const,
    snapshot: Object.freeze({ ...previous, generation }),
  });
}

function compileWithReuse(
  applicable: ReturnType<typeof projectApplicableWikiRules>,
  generation: number,
  previous: CompiledWikiSnapshot | undefined,
): ReturnType<typeof compileWikiRules> {
  if (previous === undefined || !compiledRulesMatch(applicable, previous.rules)) {
    return compileWikiRules(applicable, generation);
  }
  return Object.freeze({
    ok: true as const,
    snapshot: Object.freeze({ ...previous, generation }),
  });
}

function compiledRulesMatch(
  applicable: ReturnType<typeof projectApplicableWikiRules>,
  compiled: readonly CompiledWikiRule[],
): boolean {
  if (applicable.length !== compiled.length) return false;
  return applicable.every((rule, index) => {
    const previous = compiled[index];
    return previous !== undefined && rule.locale === previous.locale &&
      rule.channel === previous.channel && rule.boundary === previous.boundary &&
      rule.form === previous.form && rule.canonical === previous.canonical;
  });
}

function createEmptyWikiBasis(): WikiBasis {
  const compiled = compileWikiBasis(createEmptyWikiState(), 0);
  if (!compiled.ok) {
    throw new Error("The built-in empty Wiki basis is invalid.");
  }
  return compiled.basis;
}

export const EMPTY_WIKI_BASIS = createEmptyWikiBasis();
