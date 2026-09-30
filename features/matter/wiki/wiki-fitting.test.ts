import { describe, expect, it } from "vitest";
import {
  applyWikiEvent,
  createEmptyWikiState,
  createInitialWikiState,
} from "./wiki-evidence";
import {
  compileWikiFitSnapshot,
  fitCommittedWikiText,
  fitCommittedWikiTextResult,
  wikiFitSnapshotMatchesState,
} from "./wiki-fitting";
import { MAX_WIKI_FITTING_TARGETS, type WikiState } from "./wiki-model";
import type { WikiQualifiedProducerRelease } from "./wiki-producer-qualification";
import {
  MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
} from
  "./wiki-qualified-producer-releases";
import { MATTER_WIKI_RUNTIME_PRODUCER_RELEASES } from
  "./wiki-runtime-producer-releases";

describe("Wiki fitting", () => {
  it("proposes bounded spoken evidence for one conservative internal typo", () => {
    const snapshot = runtimeSnapshot(withLexemes("Engelbart"));

    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart described the demo",
    })).toEqual([{
      type: "observe-evidence",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "Englebart",
      canonical: "Engelbart",
      source: "machine-inference",
      producer: "latin-internal-edit-v2",
    }]);
  });

  it("abstains for written output, mixed scripts, and protected literals", () => {
    const snapshot = runtimeSnapshot(withLexemes("Engelbart", "Codex"));

    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "written",
      text: "Englebart",
    })).toEqual([]);
    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Codecs xnglebart https://example.com/Englebart `Englebart`",
    })).toEqual([]);
  });

  it("keeps all unique candidates so the evidence policy can abstain on ambiguity", () => {
    const snapshot = runtimeSnapshot(withLexemes("Abcxefgh", "Abcyefgh"));

    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Abczefgh",
    }).map((event) => event.canonical)).toEqual(["Abcxefgh", "Abcyefgh"]);
  });

  it("treats an observed canonical as a hard no-op", () => {
    const latin = runtimeSnapshot(withLexemes("Englebart", "Engelbart"));
    expect(fitCommittedWikiText(latin, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart",
    }, new Set(["latin-internal-edit-v2"]))).toEqual([]);

  });

  it("respects generated-range authority and never retains the source text", () => {
    const snapshot = runtimeSnapshot(withLexemes("Engelbart"));
    const text = "Source Englebart. Generated Englebart";
    const start = text.lastIndexOf("Englebart");
    const events = fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text,
      eligibleRanges: [{ start, end: start + "Englebart".length }],
    });

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("Source");
  });

  it("fits every disjoint eligible range without crossing their gaps", () => {
    const snapshot = runtimeSnapshot(withLexemes("Engelbart", "Morphogenesis"));
    const text = "Englebart ignored Morphogenasis";
    const second = text.indexOf("Morphogenasis");
    const events = fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text,
      eligibleRanges: [
        { start: 0, end: "Englebart".length },
        { start: second, end: text.length },
      ],
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ form: "Englebart", canonical: "Engelbart" }),
      expect.objectContaining({ form: "Morphogenasis", canonical: "Morphogenesis" }),
    ]));
  });

  it("invalidates the candidate cache and excludes written-only lexemes", () => {
    const both = withLexemes("Engelbart");
    const snapshot = runtimeSnapshot(both);
    const changed = applyWikiEvent(both, {
      type: "rename-lexeme",
      lexemeId: both.lexemes[0].id,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "written",
    });
    if (!changed.ok) throw new Error(changed.error.message);

    expect(wikiFitSnapshotMatchesState(
      snapshot,
      changed.state,
      MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
    )).toBe(false);
    const writtenOnly = runtimeSnapshot(changed.state);
    expect(writtenOnly.stats.eligibleLexemeCount).toBe(0);
    expect(fitCommittedWikiText(writtenOnly, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart",
    })).toEqual([]);
  });

  it("invalidates candidate caches when aggregate target qualification changes", () => {
    const qualified = withAggregateLexeme("locale-segment-v1");
    const releases = [qualifiedRelease("locale-segment-v1")];
    const qualifiedSnapshot = compileWikiFitSnapshot(
      qualified,
      releases,
    );
    const legacy = Object.freeze({
      ...qualified,
      termEvidence: Object.freeze(qualified.termEvidence.map((entry) =>
        Object.freeze({ ...entry, producer: "legacy-term-v1" as const }))),
    });

    expect(wikiFitSnapshotMatchesState(
      qualifiedSnapshot,
      legacy,
      releases,
    )).toBe(false);
    const legacySnapshot = compileWikiFitSnapshot(
      legacy,
      releases,
    );
    expect(legacySnapshot.stats.eligibleLexemeCount).toBe(0);
    expect(wikiFitSnapshotMatchesState(
      legacySnapshot,
      qualified,
      releases,
    )).toBe(false);

    const decayed = Object.freeze({
      ...qualified,
      termEvidence: Object.freeze(qualified.termEvidence.map((entry) =>
        Object.freeze({ ...entry, phase: "candidate" as const, support: 0 }))),
    });
    expect(wikiFitSnapshotMatchesState(
      qualifiedSnapshot,
      decayed,
      releases,
    )).toBe(false);
    expect(compileWikiFitSnapshot(
      decayed,
      releases,
    ).stats.eligibleLexemeCount).toBe(0);
  });

  it("limits internal-edit targets to human, starter, or strict shape authority", () => {
    const broad = compileWikiFitSnapshot(
      withAggregateLexeme("locale-segment-v1", "Lexicorium"),
      MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
    );
    expect(fitCommittedWikiText(broad, {
      locale: "en-US",
      channel: "spoken",
      text: "Lexicxrium",
    }, new Set(["latin-internal-edit-v2"]))).toEqual([]);

    const distinctive = compileWikiFitSnapshot(
      withAggregateLexeme("shape-specific-v1", "MORPHOGENESIS"),
      MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
    );
    expect(Object.values(distinctive.buckets["en-US"]).some((bucket) =>
      bucket.lexemes.some((lexeme) => lexeme.canonical === "MORPHOGENESIS"))).toBe(true);
    expect(fitCommittedWikiText(distinctive, {
      locale: "en-US",
      channel: "spoken",
      text: "morphogenasis",
    }, new Set(["latin-internal-edit-v2"]))).toEqual([
      expect.objectContaining({ canonical: "MORPHOGENESIS" }),
    ]);
  });

  it("binds cache reuse to the complete sorted producer release identities", () => {
    const state = withLexemes("Engelbart");
    const latin = qualifiedRelease("latin-internal-edit-v2");
    const segment = qualifiedRelease("locale-segment-v1");
    const snapshot = compileWikiFitSnapshot(state, [segment, latin]);

    expect(snapshot.qualifiedProducerReleases.map((release) =>
      release.identity.producerId)).toEqual([
      "latin-internal-edit-v2",
      "locale-segment-v1",
    ]);
    expect(Object.isFrozen(snapshot.qualifiedProducerReleases)).toBe(true);
    expect(snapshot.qualifiedProducerReleases.every((release) =>
      Object.isFrozen(release) && Object.isFrozen(release.identity) &&
      Object.isFrozen(release.corpus))).toBe(true);
    expect(wikiFitSnapshotMatchesState(
      snapshot,
      state,
      [latin, segment],
    )).toBe(true);

    for (const changed of [
      replaceRelease(latin, {
        identity: { resourceVersion: "2.0.2" },
      }),
      replaceRelease(latin, {
        identity: { resourceDigest: testDigest("1") },
      }),
      replaceRelease(latin, {
        corpus: { corpusDigest: testDigest("2") },
      }),
    ]) {
      expect(wikiFitSnapshotMatchesState(
        snapshot,
        state,
        [changed, segment],
      )).toBe(false);
    }
  });

  it("invalidates the fitting cache when human recency changes", () => {
    const state = withLexemes("Engelbart", "Morphogenesis");
    const snapshot = runtimeSnapshot(state);
    const changed = Object.freeze({
      ...state,
      lexemes: Object.freeze(state.lexemes.map((lexeme, index) =>
        index === 0
          ? Object.freeze({ ...lexeme, confirmedAtRevision: state.revision })
          : lexeme)),
    });

    expect(wikiFitSnapshotMatchesState(
      snapshot,
      changed,
      MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
    )).toBe(false);
  });

  it("keeps fitting bounded and gives the newest human target the last slot", () => {
    const lexemes = Array.from(
      { length: MAX_WIKI_FITTING_TARGETS + 1 },
      (_, index) => Object.freeze({
        id: index + 1,
        locale: "en-US" as const,
        canonical: index === 0
          ? "Oldesttarget"
          : index === MAX_WIKI_FITTING_TARGETS
            ? "Newesttarget"
            : `Filler${alphaSuffix(index)}`,
        scope: "both" as const,
        provenance: "human-confirmed" as const,
        confirmedAtRevision: index + 1,
      }),
    );
    const state = Object.freeze({
      ...createEmptyWikiState(),
      revision: lexemes.length,
      nextLexemeId: lexemes.length + 1,
      lexemes: Object.freeze(lexemes),
    });
    const snapshot = runtimeSnapshot(state);

    expect(snapshot.stats.eligibleLexemeCount).toBe(MAX_WIKI_FITTING_TARGETS);
    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Newsettarget Oldsettarget",
    }, new Set(["latin-internal-edit-v2"]))).toEqual([
      expect.objectContaining({ canonical: "Newesttarget" }),
    ]);
  });

  it("scores the words a partial fitting scan reached and stops before the bound", () => {
    const canonicals = Array.from({ length: 33 }, (_, index) =>
      `Engelbart${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
    const observed = canonicals.map((canonical) =>
      canonical.replace("Engel", "Engle"));
    const result = fitCommittedWikiTextResult(
      runtimeSnapshot(withLexemes(...canonicals)),
      { locale: "en-US", channel: "spoken", text: observed.join(" ") },
      new Set(["latin-internal-edit-v2"]),
    );
    expect(result.status).toBe("partial");
    expect(result.events).toHaveLength(32);
    expect(result.events.map((event) =>
      event.source === "machine-inference" ? event.form : "")).toEqual(observed.slice(0, 32));
    expect(result.scannedScripts).toEqual(["latin"]);
  });

  it("offers every scanned eligible script, not only fitted words", () => {
    expect(fitCommittedWikiTextResult(
      runtimeSnapshot(withLexemes("Engelbart")),
      { locale: "en-US", channel: "spoken", text: "Englebart 材料" },
      new Set(["latin-internal-edit-v2"]),
    )).toMatchObject({ status: "ok", scannedScripts: ["latin", "han"] });
    expect(fitCommittedWikiTextResult(
      runtimeSnapshot(withLexemes("Engelbart")),
      { locale: "en-US", channel: "written", text: "Englebart" },
      new Set(["latin-internal-edit-v2"]),
    )).toEqual({ status: "censored", events: [], scannedScripts: [] });
  });
});

describe("script-routed Wiki fitting", () => {
  const LATIN = new Set(["latin-internal-edit-v2"] as const);

  function fit(
    state: WikiState,
    locale: "zh-CN" | "zh-TW" | "ja-JP" | "en-US" | "de-DE",
    text: string,
  ) {
    return fitCommittedWikiTextResult(runtimeSnapshot(state), {
      locale,
      channel: "spoken",
      text,
    }, LATIN);
  }

  it("fits a Latin word inside Chinese and Japanese speech in the en-US ledger", () => {
    const state = withLexemes("Engelbart", "Morphogenesis");

    expect(fit(state, "zh-CN", "我读了Englebart的论文")).toEqual({
      status: "ok",
      events: [{
        type: "observe-evidence",
        locale: "en-US",
        channel: "spoken",
        boundary: "word",
        form: "Englebart",
        canonical: "Engelbart",
        source: "machine-inference",
        producer: "latin-internal-edit-v2",
      }],
      scannedScripts: ["latin", "han"],
      routedScripts: ["latin"],
    });
    expect(fit(state, "zh-TW", "我讀了Morphogenasis的論文").events).toEqual([
      expect.objectContaining({ locale: "en-US", canonical: "Morphogenesis" }),
    ]);
    expect(fit(state, "ja-JP", "Englebartの論文を読んだ").events).toEqual([
      expect.objectContaining({ locale: "en-US", form: "Englebart" }),
    ]);
  });

  it("extracts routed words across punctuation, spacing, and emoji", () => {
    const state = withLexemes("Engelbart", "Morphogenesis");

    expect(fit(state, "zh-CN", "Englebart，😀Morphogenasis！").events.map((event) =>
      event.source === "machine-inference" ? event.form : "")).toEqual([
      "Englebart",
      "Morphogenasis",
    ]);
    expect(fit(state, "zh-CN", "我读了 Englebart 的论文").events).toHaveLength(1);
  });

  it("does not fit a word joined to digits, and never routes digits alone", () => {
    const state = withLexemes("Engelbart");

    // A word no relation could name neither votes nor counts as an absence.
    expect(fit(state, "zh-CN", "Englebart2号")).toMatchObject({
      events: [],
      scannedScripts: ["han"],
      routedScripts: [],
    });
    expect(fit(state, "zh-CN", "2026年的材料")).toMatchObject({
      events: [],
      scannedScripts: ["han"],
      routedScripts: [],
    });
  });

  it("folds full-width Latin to the form the matcher applies", () => {
    expect(fit(withLexemes("Engelbart"), "zh-CN", "我读了Ｅｎｇｌｅｂａｒｔ的论文").events)
      .toEqual([expect.objectContaining({ locale: "en-US", form: "Englebart" })]);
  });

  it("reads a full-width Latin word by script, not by ledger", () => {
    const state = withLexemes("Engelbart");

    // In an English turn it votes exactly as it does routed out of Chinese.
    expect(fit(state, "en-US", "I read Ｅｎｇｌｅｂａｒｔ today")).toMatchObject({
      events: [expect.objectContaining({ locale: "en-US", form: "Englebart" })],
      scannedScripts: ["latin"],
    });
    // A German turn has no Latin producer, and its full-width words still
    // never reach the en-US targets.
    expect(fit(state, "de-DE", "Ｅｎｇｌｅｂａｒｔ").events).toEqual([]);
  });

  it("never counts a Latin word the producer cannot read as an absence", () => {
    const state = withLexemes("Engelbart");
    for (const text of ["Englebart2", "Ｅｎｇｌｅｂａｒｔ２", "Englebart's", "Café"]) {
      expect(fit(state, "en-US", text)).toMatchObject({ events: [], scannedScripts: [] });
    }
    expect(fit(state, "en-US", "Café Englebart").scannedScripts).toEqual(["latin"]);
  });

  it("never fits protected or joined literals in routed spans", () => {
    const state = withLexemes("Engelbart");
    for (const text of [
      "看https://example.com/Englebart的页面",
      "邮箱Englebart@example.com",
      "代码`Englebart`里",
      "他说“Englebart”",
      "路径src/Englebart/index.ts",
      "@Englebart 你好",
      "#Englebart#话题",
      "Englebart-2.0版本",
      "打开ＥｎｇｌｅＢａｒｔ模块",
      "看ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ／Ｅｎｇｌｅｂａｒｔ的页面",
      "邮箱englebart＠example.com",
      "路径ｓｒｃ／Ｅｎｇｌｅｂａｒｔ／ｉｎｄｅｘ．ｔｓ",
      "运行－－Ｅｎｇｌｅｂａｒｔ参数",
      "＠Englebart 你好",
      "＃Englebart＃话题",
      "代码｀Englebart｀里",
    ]) {
      expect(fit(state, "zh-CN", text)).toMatchObject({ events: [], routedScripts: [] });
    }
  });

  it("counts an English word only where its word rule could apply", () => {
    const state = withLexemes("Engelbart");
    for (const text of ["@Englebart said", "#Englebart", "Englebart-style", "Englebart_x"]) {
      expect(fit(state, "en-US", text).events).toEqual([]);
    }
    expect(fit(state, "en-US", "(Englebart), later").events).toEqual([
      expect.objectContaining({ form: "Englebart", canonical: "Engelbart" }),
    ]);
  });

  it("never fits full-width literals or joiners in an English turn", () => {
    const state = withLexemes("Engelbart");
    for (const text of [
      "＠Englebart said",
      "＃Englebart＃",
      "｀Englebart｀",
      "ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ／Englebart",
      "englebart＠example.com",
      "src／Englebart／index．ts",
      "－－Englebart",
      "Englebart．ts",
      "my＿Englebart",
      "Englebart－style",
    ]) {
      expect(fit(state, "en-US", text).events).toEqual([]);
    }
    // A protected or joined word is not an opportunity either.
    expect(fit(state, "en-US", "＃Englebart＃").scannedScripts).toEqual([]);
    expect(fit(state, "en-US", "（Englebart），later").events).toEqual([
      expect.objectContaining({ form: "Englebart", canonical: "Engelbart" }),
    ]);
  });

  it("never lets a CJK span reach the Latin producer", () => {
    expect(fit(withLexemes("Engelbart"), "zh-CN", "恩格尔巴特的演示")).toEqual({
      status: "ok",
      events: [],
      scannedScripts: ["han"],
      routedScripts: [],
    });
  });

  it("reaches only en-US targets, never a same-spelling lexeme in another locale", () => {
    for (const locale of ["zh-CN", "zh-TW", "ja-JP", "de-DE"] as const) {
      expect(fit(withLocaleLexemes(locale, "Engelbart"), "zh-CN", "Englebart的").events)
        .toEqual([]);
    }
    expect(fit(withLexemes("Engelbart"), "de-DE", "Englebart")).toMatchObject({
      events: [],
      routedScripts: [],
    });
  });

  it("keeps an observed en-US canonical a hard no-op inside Chinese speech", () => {
    expect(fit(withLexemes("Englebart", "Engelbart"), "zh-CN", "Englebart的演示").events)
      .toEqual([]);
  });

  it("cannot tell a different real name one edit away until it is canonical", () => {
    // A documented limit of the internal-edit producer in every locale: the
    // gate, margin, canonical veto, and revert/reject are its mitigation.
    expect(fit(withLexemes("Engelbart"), "zh-CN", "我采访了Engelhart").events)
      .toEqual([expect.objectContaining({ form: "Engelhart", canonical: "Engelbart" })]);
    expect(fit(withLexemes("Engelhart", "Engelbart"), "zh-CN", "我采访了Engelhart").events)
      .toEqual([]);
    expect(fit(withLexemes("Engelbart"), "zh-CN", "Engelhard公司").events).toEqual([]);
  });

  it("targets the long Latin starters but not KFC or the p-to-q starter", () => {
    const snapshot = runtimeSnapshot(createInitialWikiState());
    const events = fitCommittedWikiText(snapshot, {
      locale: "zh-CN",
      channel: "spoken",
      text: "Englebart和Morphogenasis，还有KFD和P to R",
    }, LATIN);

    expect(snapshot.stats.eligibleLexemeCount).toBe(2);
    expect(events.map((event) => event.canonical)).toEqual(["Engelbart", "Morphogenesis"]);
  });
});

function withLexemes(...canonicals: string[]): WikiState {
  return withLocaleLexemes("en-US", ...canonicals);
}

function runtimeSnapshot(state: WikiState) {
  return compileWikiFitSnapshot(state, MATTER_WIKI_RUNTIME_PRODUCER_RELEASES);
}

function withLocaleLexemes(
  locale: "en-US" | "zh-CN" | "zh-TW" | "ja-JP" | "de-DE",
  ...canonicals: string[]
): WikiState {
  let state = createEmptyWikiState();
  for (const canonical of canonicals) {
    const result = applyWikiEvent(state, {
      type: "create-lexeme",
      locale,
      canonical,
      scope: "both",
    });
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  return state;
}

function withAggregateLexeme(
  producer: "locale-segment-v1" | "shape-specific-v1",
  canonical = "Lexicorium",
): WikiState {
  let state = createEmptyWikiState();
  for (let index = 0; index < 2; index += 1) {
    const result = applyWikiEvent(state, {
      type: "observe-evidence",
      source: "recent-material",
      locale: "en-US",
      canonical,
      producer,
    });
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  return state;
}

function qualifiedRelease(
  producerId: WikiQualifiedProducerRelease["identity"]["producerId"],
): WikiQualifiedProducerRelease {
  const release = MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES.find((candidate) =>
    candidate.identity.producerId === producerId);
  if (release === undefined) throw new Error(`Missing ${producerId} release.`);
  return release;
}

function replaceRelease(
  release: WikiQualifiedProducerRelease,
  changes: Readonly<{
    identity?: Partial<WikiQualifiedProducerRelease["identity"]>;
    corpus?: Partial<WikiQualifiedProducerRelease["corpus"]>;
  }>,
): WikiQualifiedProducerRelease {
  return {
    ...release,
    identity: { ...release.identity, ...changes.identity },
    corpus: { ...release.corpus, ...changes.corpus },
  };
}

function testDigest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function alphaSuffix(value: number): string {
  let remaining = value;
  let suffix = "";
  do {
    suffix = String.fromCharCode(97 + (remaining % 26)) + suffix;
    remaining = Math.floor(remaining / 26);
  } while (remaining > 0);
  return suffix;
}
