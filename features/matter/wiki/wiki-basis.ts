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

  const applicable = projectApplicableWikiRules(parsed.state, projectionPolicy);
  const compiled = compileWithReuse(
    applicable,
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
  const confirmedApplicable = projectionPolicy.includeProvisional
    ? projectApplicableWikiRules(parsed.state, WIKI_CONFIRMED_ONLY)
    : applicable;
  const confirmed = compiledRulesMatch(confirmedApplicable, compiled.snapshot.rules)
    ? compiled
    : compileWithReuse(
        confirmedApplicable,
        generation,
        previousBasis?.confirmedSnapshot,
      );
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

  return Object.freeze({
    ok: true,
    basis: Object.freeze({
      stateRevision: parsed.state.revision,
      snapshot: compiled.snapshot,
      confirmedSnapshot: confirmed.snapshot,
      fitSnapshot: previousBasis !== undefined &&
          wikiFitSnapshotMatchesState(previousBasis.fitSnapshot, parsed.state)
        ? previousBasis.fitSnapshot
        : compileWikiFitSnapshot(parsed.state),
    }),
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
