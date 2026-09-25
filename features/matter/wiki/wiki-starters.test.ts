import { describe, expect, it } from "vitest";
import { canonicalizeWikiText } from "./canonicalize-wiki-text";
import { compileWikiBasis } from "./wiki-basis";
import {
  applyWikiEvent,
  createEmptyWikiState,
  createInitialWikiState,
  ensureWikiStarterLexemes,
} from "./wiki-evidence";

const STARTERS = ["Engelbart", "Morphogenesis", "KFC", "[p → q]"];

describe("Wiki starter lexemes", () => {
  it("creates the four editable spellings in stable product order", () => {
    const state = createInitialWikiState();

    expect(state.revision).toBe(0);
    expect(state.lexemes.map((entry) => entry.canonical)).toEqual(STARTERS);
    expect(state.lexemes).toEqual(state.lexemes.map((entry, index) => expect.objectContaining({
      locale: index === 3 ? "zh-CN" : "en-US",
      scope: "both",
      provenance: "aggregate-evidence",
      confirmedAtRevision: null,
    })));
    expect(state.authorities).toEqual([
      expect.objectContaining({ lexemeId: 4, channel: "spoken", form: "P to Q" }),
      expect.objectContaining({ lexemeId: 4, channel: "spoken", form: "p to q" }),
    ]);
  });

  it("resolves the explicit p-to-q spoken forms without enabling written fitting", () => {
    const compiled = compileWikiBasis(createInitialWikiState(), 1);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    expect(canonicalizeWikiText(
      compiled.basis.snapshot,
      "zh-CN",
      "spoken",
      "P to Q and p to q",
    ).text).toBe("[p → q] and [p → q]");
    expect(canonicalizeWikiText(
      compiled.basis.snapshot,
      "zh-CN",
      "written",
      "P to Q",
    ).text).toBe("P to Q");
    expect(canonicalizeWikiText(
      compiled.basis.snapshot,
      "en-US",
      "spoken",
      "P to Q",
    ).text).toBe("P to Q");
  });

  it("adds missing starters once without changing existing configuration", () => {
    const first = ensureWikiStarterLexemes(createEmptyWikiState());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.lexemes.map((entry) => entry.canonical)).toEqual(STARTERS);
    expect(first.state.lexemes).toEqual(first.state.lexemes.map(() => expect.objectContaining({
      provenance: "aggregate-evidence",
      confirmedAtRevision: null,
    })));
    expect(first.state.authorities).toHaveLength(2);

    const compiled = compileWikiBasis(first.state, 1);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(canonicalizeWikiText(
      compiled.basis.snapshot,
      "zh-CN",
      "spoken",
      "P to Q and p to q",
    ).text).toBe("[p → q] and [p → q]");

    const second = ensureWikiStarterLexemes(first.state);
    expect(second).toEqual({ ok: true, state: first.state, changed: false });
  });

  it("moves the safe V3 p-to-q starter to its spoken locale without changing its id", () => {
    const initial = createInitialWikiState();
    const legacy = {
      ...initial,
      lexemes: initial.lexemes.map((entry) => entry.canonical === "[p → q]"
        ? { ...entry, locale: "en-US" as const }
        : entry),
    };

    const migrated = ensureWikiStarterLexemes(legacy);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state.lexemes.filter((entry) => entry.canonical === "[p → q]")).toEqual([
      expect.objectContaining({ id: 4, locale: "zh-CN", provenance: "aggregate-evidence" }),
    ]);
    expect(migrated.state.authorities).toEqual([
      expect.objectContaining({ lexemeId: 4, form: "P to Q" }),
      expect.objectContaining({ lexemeId: 4, form: "p to q" }),
    ]);
  });

  it("collapses only a safe duplicate p-to-q starter", () => {
    const initial = createInitialWikiState();
    const duplicate = {
      ...initial,
      nextLexemeId: 6,
      lexemes: [...initial.lexemes, {
        id: 5,
        locale: "en-US" as const,
        canonical: "[p → q]",
        scope: "both" as const,
        provenance: "aggregate-evidence" as const,
        confirmedAtRevision: null,
      }],
    };

    const migrated = ensureWikiStarterLexemes(duplicate);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state.lexemes.filter((entry) => entry.canonical === "[p → q]")).toEqual([
      expect.objectContaining({ id: 4, locale: "zh-CN" }),
    ]);
    expect(migrated.state.authorities).toHaveLength(2);
  });

  it("does not replace a removed legacy p-to-q starter with the new locale", () => {
    const initial = createInitialWikiState();
    const legacy = {
      ...initial,
      lexemes: initial.lexemes.map((entry) => entry.canonical === "[p → q]"
        ? { ...entry, locale: "en-US" as const }
        : entry),
    };
    const removed = applyWikiEvent(legacy, { type: "remove-lexeme", lexemeId: 4 });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    const migrated = ensureWikiStarterLexemes(removed.state);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state.lexemes.some((entry) => entry.canonical === "[p → q]")).toBe(false);
    expect(migrated.state.lexemeTombstones).toContainEqual(expect.objectContaining({
      locale: "en-US",
      canonical: "[p → q]",
    }));
  });

  it("abstains when the legacy p-to-q entry has an unknown relation", () => {
    const initial = createInitialWikiState();
    const legacy = {
      ...initial,
      lexemes: initial.lexemes.map((entry) => entry.canonical === "[p → q]"
        ? { ...entry, locale: "en-US" as const }
        : entry),
      authorities: [{
        lexemeId: 4,
        channel: "spoken" as const,
        boundary: "word" as const,
        form: "P two Q",
        confirmedAtRevision: 0,
      }],
    };

    const migrated = ensureWikiStarterLexemes(legacy);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state.lexemes.filter((entry) => entry.canonical === "[p → q]"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 4, locale: "en-US" }),
        expect.objectContaining({ locale: "zh-CN" }),
      ]));
    expect(migrated.state.authorities).toContainEqual(expect.objectContaining({
      lexemeId: 4,
      form: "P two Q",
    }));
  });

  it("keeps a person's lexeme while adding automatic starters and exact spoken authority", () => {
    const custom = applyWikiEvent(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Vannevar Bush",
      scope: "both",
    });
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;

    const migrated = ensureWikiStarterLexemes(custom.state);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state.lexemes[0]).toEqual(expect.objectContaining({
      canonical: "Vannevar Bush",
      provenance: "human-confirmed",
    }));
    expect(migrated.state.lexemes.slice(1)).toEqual(
      migrated.state.lexemes.slice(1).map(() => expect.objectContaining({
        provenance: "aggregate-evidence",
        confirmedAtRevision: null,
      })),
    );

    const compiled = compileWikiBasis(migrated.state, 2);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(canonicalizeWikiText(
      compiled.basis.snapshot,
      "zh-CN",
      "spoken",
      "P to Q",
    ).text).toBe("[p → q]");
  });

  it("preserves hidden p-to-q authority while its spoken scope is disabled", () => {
    const initial = createInitialWikiState();
    const legacy = {
      ...initial,
      lexemes: initial.lexemes.map((entry) => entry.canonical === "[p → q]"
        ? { ...entry, scope: "written" as const }
        : entry),
      authorities: [],
    };
    const migrated = ensureWikiStarterLexemes(legacy);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state.authorities).toHaveLength(2);

    const writtenOnly = compileWikiBasis(migrated.state, 3);
    expect(writtenOnly.ok).toBe(true);
    if (!writtenOnly.ok) return;
    expect(canonicalizeWikiText(
      writtenOnly.basis.snapshot,
      "zh-CN",
      "spoken",
      "P to Q",
    ).text).toBe("P to Q");

    const pToQ = migrated.state.lexemes.find((entry) => entry.canonical === "[p → q]");
    if (pToQ === undefined) throw new Error("p-to-q starter missing");
    const restored = applyWikiEvent(migrated.state, {
      type: "rename-lexeme",
      lexemeId: pToQ.id,
      locale: pToQ.locale,
      canonical: pToQ.canonical,
      scope: "both",
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const restoredBasis = compileWikiBasis(restored.state, 4);
    expect(restoredBasis.ok).toBe(true);
    if (!restoredBasis.ok) return;
    expect(canonicalizeWikiText(
      restoredBasis.basis.snapshot,
      "zh-CN",
      "spoken",
      "P to Q",
    ).text).toBe("[p → q]");
  });

  it.each(["Matter", "Douglas Engelbart", "Engelbart"])(
    "replaces only the untouched %s starter set",
    (legacyFirst) => {
      const initial = createInitialWikiState();
      const legacy = {
        ...initial,
      lexemes: initial.lexemes.map((entry, index) => ({
        ...entry,
        locale: "en-US" as const,
        canonical: index === 0 ? legacyFirst : STARTERS[index]!,
        provenance: "human-confirmed" as const,
        confirmedAtRevision: 0,
      })),
      authorities: [],
      };

      const migrated = ensureWikiStarterLexemes(legacy);
      expect(migrated.ok).toBe(true);
      if (!migrated.ok) return;
      expect(migrated.changed).toBe(true);
      expect(migrated.state.lexemes.map((entry) => entry.canonical)).toEqual(STARTERS);
    },
  );

  it("never reconstructs a starter that a person removed", () => {
    const initial = createInitialWikiState();
    const removed = applyWikiEvent(initial, {
      type: "remove-lexeme",
      lexemeId: initial.lexemes[0]!.id,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    const ensured = ensureWikiStarterLexemes(removed.state);
    expect(ensured).toEqual({ ok: true, state: removed.state, changed: false });
    if (!ensured.ok) return;
    expect(ensured.state.lexemes.map((entry) => entry.canonical))
      .toEqual(STARTERS.slice(1));
  });

  it("does not guess around a saturated legacy decision ledger", () => {
    const saturated = {
      ...createEmptyWikiState(),
      automaticLearningSaturated: true,
    };

    expect(ensureWikiStarterLexemes(saturated)).toEqual({
      ok: true,
      state: saturated,
      changed: false,
    });
  });
});
