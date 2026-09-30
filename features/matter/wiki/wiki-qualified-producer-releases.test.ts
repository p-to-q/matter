import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  readDoubleMetaphoneQualificationResourceBytes,
  readFittingProducerQualificationBytes,
  readPinyinQualificationResourceBytes,
  readTermProducerQualificationBytes,
  runLocalLanguageQualifications,
} from
  "../../../scripts/wiki/qualification/local-language-v1";
import { readProducerBytes as readLatinInternalEditProducerBytes } from
  "../../../scripts/wiki/qualification/latin-internal-edit-v2";
import {
  digestWikiProducerArtifact,
  type WikiProducerQualificationManifest,
} from "./wiki-producer-qualification";
import {
  MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES,
} from
  "./wiki-qualified-producer-releases";
import {
  MATTER_WIKI_RUNTIME_ALIAS_PRODUCERS,
  MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
} from
  "./wiki-runtime-producer-releases";

describe("qualified Wiki producer releases", () => {
  it("releases only deterministic collection and bounded internal edits to runtime", () => {
    expect(MATTER_WIKI_RUNTIME_PRODUCER_RELEASES.map((release) =>
      release.identity.producerId)).toEqual([
      "latin-internal-edit-v2",
      "locale-segment-v1",
      "shape-specific-v1",
    ]);
    expect(MATTER_WIKI_RUNTIME_ALIAS_PRODUCERS).toEqual(["latin-internal-edit-v2"]);
  });

  it("keeps qualification-only pronunciation packages out of product fitting", async () => {
    const source = await readFile(new URL("./wiki-fitting.ts", import.meta.url), "utf8");

    expect(source).not.toContain("double-metaphone");
    expect(source).not.toContain("pinyin-pro");
    expect(source).not.toContain("PronunciationIndex");
  });

  it("reproduces every committed local producer from controlled corpora", async () => {
    const result = await runLocalLanguageQualifications(
      process.env.MATTER_RUN_WIKI_QUALIFICATION === "1",
    );

    if (process.env.MATTER_RUN_WIKI_QUALIFICATION === "1") {
      console.info(JSON.stringify({
        releases: result.qualification.qualifiedProducers.map((release) => ({
          ...release.identity,
          ...release.corpus,
        })),
        performance: result.performance,
      }, null, 2));
    }
    expect(result.qualification.decisions).toHaveLength(6);
    expect(result.qualification.decisions.map((decision) => ({
      producerId: decision.producerId,
      qualified: decision.qualified,
      reasons: decision.reasons,
    }))).toEqual([
      { producerId: "latin-internal-edit-v2", qualified: true, reasons: [] },
      { producerId: "shape-specific-v1", qualified: true, reasons: [] },
      { producerId: "locale-segment-v1", qualified: true, reasons: [] },
      { producerId: "en-metaphone-v1", qualified: true, reasons: [] },
      { producerId: "zh-exact-homophone-v1", qualified: true, reasons: [] },
      { producerId: "zh-final-pair-v1", qualified: true, reasons: [] },
    ]);
    expect(result.qualification.qualifiedProducers)
      .toEqual(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES);

    // Abstention and two votes are recorded apart. Only an ambiguity case may
    // carry votes that apply nothing, and only because they compete for one
    // source; every other non-positive case casts no vote at all.
    const categories = new Map<string, string>(result.candidates.flatMap((candidate) => {
      const manifest = candidate.manifest as WikiProducerQualificationManifest;
      return manifest.cases.map((item) =>
        [`${manifest.identity.producerId} ${item.caseId}`, item.category] as const);
    }));
    const unapplied: string[] = [];
    for (const [producerId, votes] of Object.entries(result.votes)) {
      for (const vote of votes) {
        const category = categories.get(`${producerId} ${vote.caseId}`);
        if (category !== "positive" && category !== "ambiguity") {
          expect(vote.voteActionIds, `${producerId} ${vote.caseId}`).toEqual([]);
        }
        if (vote.appliedActionId === null && vote.voteActionIds.length > 0) {
          unapplied.push(`${producerId} ${vote.caseId} ${vote.voteActionIds.join(" | ")}`);
        }
      }
    }
    expect(unapplied.sort()).toEqual([
      "latin-internal-edit-v2 ambiguity-routed-brand-collision " +
        "relation:en-US:Morphogenosis>Morphogenasis | relation:en-US:Morphogenosis>Morphogenesis",
      "latin-internal-edit-v2 ambiguity-routed-name-collision " +
        "relation:en-US:Engelbirt>Engelbart | relation:en-US:Engelbirt>Engelbert",
      "latin-internal-edit-v2 ambiguity-two-canonicals " +
        "relation:en-US:Abczefgh>Abcxefgh | relation:en-US:Abczefgh>Abcyefgh",
    ]);
  }, 120_000);

  it("binds the pinyin release to the executable dictionaries", async () => {
    const resource = await readPinyinQualificationResourceBytes();
    expect(resource.byteLength).toBeGreaterThan(550_000);
    expect(new TextDecoder().decode(resource)).toContain(
      "node_modules/pinyin-pro/dist/esm/data/dict1.mjs",
    );
    const changed = resource.slice();
    changed[Math.floor(changed.length / 2)] ^= 1;
    expect(await digestWikiProducerArtifact(changed))
      .not.toBe(await digestWikiProducerArtifact(resource));
  }, 60_000);

  it("binds Double Metaphone to its package entry contract and executable", async () => {
    const resource = await readDoubleMetaphoneQualificationResourceBytes();
    const decoded = new TextDecoder().decode(resource);
    expect(decoded).toContain("node_modules/double-metaphone/package.json");
    expect(decoded).toContain("node_modules/double-metaphone/index.js");
    const changed = resource.slice();
    changed[Math.floor(changed.length / 2)] ^= 1;
    expect(await digestWikiProducerArtifact(changed))
      .not.toBe(await digestWikiProducerArtifact(resource));
  }, 60_000);

  it("binds every runtime-value producer dependency into the source digest", async () => {
    const term = await readTermProducerQualificationBytes();
    const fitting = await readFittingProducerQualificationBytes();
    const latin = await readLatinInternalEditProducerBytes();
    const termText = new TextDecoder().decode(term);
    const fittingText = new TextDecoder().decode(fitting);
    const latinText = new TextDecoder().decode(latin);

    for (const file of [
      "wiki-term-collection.ts",
      "canonicalize-wiki-text.ts",
      "wiki-text-safety.ts",
      "wiki-invariants.ts",
      "wiki-model.ts",
      "wiki-learning-policy.ts",
      "wiki-script.ts",
      "wiki-script-routing.ts",
      "config/locales.ts",
      "tree/unicode-text.ts",
    ]) expect(termText).toContain(file);
    for (const file of [
      "pronunciation-fitting-v1.ts",
      "canonicalize-wiki-text.ts",
      "wiki-script-routing.ts",
      "wiki-text-safety.ts",
      "wiki-learning-policy.ts",
      "wiki-model.ts",
    ]) expect(fittingText).toContain(file);
    for (const file of [
      "wiki-fitting.ts",
      "canonicalize-wiki-text.ts",
      "wiki-text-safety.ts",
      "wiki-learning-policy.ts",
      "wiki-model.ts",
      "wiki-script.ts",
      "wiki-script-routing.ts",
    ]) expect(latinText).toContain(file);

    const changed = fitting.slice();
    changed[changed.length - 1] ^= 1;
    expect(await digestWikiProducerArtifact(changed))
      .not.toBe(await digestWikiProducerArtifact(fitting));
  }, 60_000);
});
