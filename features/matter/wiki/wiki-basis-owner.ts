import {
  EMPTY_WIKI_BASIS,
  compileWikiBasis,
  type CompileWikiBasisResult,
  type WikiBasis,
} from "./wiki-basis";

export type PublishWikiBasisResult = CompileWikiBasisResult | Readonly<{
  ok: false;
  error: Readonly<{
    code: "STALE_GENERATION";
    message: string;
  }>;
}>;

/**
 * Owns one atomic compiled reference. Persistence remains responsible for CAS
 * and durability; this owner only publishes a newer, successfully compiled
 * generation after that durable boundary has succeeded.
 */
export class WikiBasisOwner {
  #current: WikiBasis = EMPTY_WIKI_BASIS;

  read(): WikiBasis {
    return this.#current;
  }

  publish(state: unknown, generation: number): PublishWikiBasisResult {
    const compiled = compileWikiBasis(state, generation);
    if (!compiled.ok) return compiled;
    return this.publishCompiled(compiled.basis);
  }

  /** Publishes one exact result already proven by `compileWikiBasis`. */
  publishCompiled(basis: WikiBasis): PublishWikiBasisResult {
    const generation = basis.snapshot.generation;
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      generation <= this.#current.snapshot.generation
    ) {
      return Object.freeze({
        ok: false,
        error: Object.freeze({
          code: "STALE_GENERATION",
          message: "A Wiki basis generation must advance monotonically.",
        }),
      });
    }
    this.#current = basis;
    return Object.freeze({ ok: true, basis });
  }
}
