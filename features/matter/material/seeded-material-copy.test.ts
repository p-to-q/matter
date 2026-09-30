import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import type { ThoughtTree } from "../tree/model";
import type { TreeHistory } from "../tree/history";
import { commitTreeCommand, undoTreeHistory } from "../tree/history";
import { canReplayTreeHistory } from "../tree/history-replay-oracle";
import { validateThoughtTree } from "../tree/invariants";
import {
  SEEDED_DOCUMENT_NODE_IDS,
  createBranchChildCommand,
  createSeededDocument,
} from "./seeded-document";
import { relocalizeSeededSession } from "./seeded-session-localization";
import {
  SEEDED_PASSAGE_KEYS,
  seededMaterialCopy,
  seededNodeLabel,
  seededNodeText,
} from "./seeded-material-copy";
import { seededFixedLabels } from "./seeded-labels";
import { seededBranchTexts } from "./seeded-branch-copy";
import {
  seededFallbackBranchTexts,
  seededInitialNodeText,
} from "./seeded-material-core";

const TEST_HISTORY_LIMITS = {
  maxEntries: 64,
  maxRetainedInverseBytes: 512_000,
};

describe("localized seeded material copy", () => {
  it("closes every seeded passage and Branch family over the canonical locales", () => {
    for (const locale of MATTER_LOCALES) {
      const copy = seededMaterialCopy(locale);
      expect(copy.title.trim()).not.toBe("");
      expect(Object.keys(copy.nodes).sort()).toEqual([...SEEDED_PASSAGE_KEYS].sort());
      expect(Object.keys(copy.labels).sort()).toEqual([...SEEDED_PASSAGE_KEYS].sort());
      const maxLabelGraphemes = locale === "zh-CN" || locale === "zh-TW"
        ? 14
        : locale === "ja-JP" ? 20 : 32;
      for (const key of SEEDED_PASSAGE_KEYS) {
        expect(copy.nodes[key].trim()).not.toBe("");
        expect(copy.labels[key].trim()).not.toBe("");
        expect(graphemeLength(copy.labels[key])).toBeLessThanOrEqual(maxLabelGraphemes);
        expect(seededNodeLabel(locale, key)).toBe(copy.labels[key]);
        expect(seededBranchTexts(locale, key).length).toBeGreaterThan(0);
      }
      expect(new Set(Object.values(copy.labels)).size).toBe(SEEDED_PASSAGE_KEYS.length);
      expect(seededFallbackBranchTexts(locale).every((text) => text.trim().length > 0))
        .toBe(true);
      expect(seededBranchTexts(locale, "root")[0])
        .toBe(seededFallbackBranchTexts(locale)[0]);
    }
    for (const key of SEEDED_PASSAGE_KEYS) {
      expect(seededInitialNodeText(key)).toBe(seededNodeText("zh-CN", key));
    }
  });

  it.each(MATTER_LOCALES)("fixes every canonical seed label in %s without claiming edited material", (locale) => {
    const fixture = createSeededDocument("expanded");
    const localized = relocalizeSeededSession(fixture.tree, fixture.history, locale);
    if (!localized.ok) throw new Error(localized.errorCode);
    const labels = seededFixedLabels(localized.tree, locale);

    expect(labels.size).toBe(SEEDED_PASSAGE_KEYS.length);
    for (const [key, nodeId] of Object.entries(SEEDED_DOCUMENT_NODE_IDS)) {
      expect(labels.get(nodeId)).toBe(seededNodeLabel(locale, key as keyof typeof SEEDED_DOCUMENT_NODE_IDS));
    }

    const edited = structuredClone(localized.tree) as ThoughtTree;
    edited.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime].text = "A person changed this passage.";
    edited.nodes[SEEDED_DOCUMENT_NODE_IDS.imaginedTime].updatedAt = "2026-08-24T12:00:00.000Z";
    expect(seededFixedLabels(edited, locale).has(SEEDED_DOCUMENT_NODE_IDS.imaginedTime)).toBe(false);
  });

  it.each(MATTER_LOCALES)("relocalizes one valid, identity-stable %s document", (locale) => {
    const fixture = createSeededDocument("expanded");
    const localized = relocalizeSeededSession(fixture.tree, fixture.history, locale);
    if (!localized.ok) throw new Error(localized.errorCode);

    expect(validateThoughtTree(localized.tree)).toEqual({ ok: true });
    expect(localized.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].text)
      .toBe(seededNodeText(locale, "root"));
    expect(localized.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.bodilyReturn].text)
      .toBe(seededNodeText(locale, "bodilyReturn"));
    expect(localized.history.entries).toEqual([]);
  });

  it("relocalizes only canonical seed copy and is referentially idempotent", () => {
    const fixture = createSeededDocument();
    const originalRoot = fixture.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root];
    const localized = relocalizeSeededSession(fixture.tree, fixture.history, "en-US");
    if (!localized.ok) throw new Error(localized.errorCode);

    expect(localized.changed).toBe(true);
    expect(localized.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root]).toMatchObject({
      text: seededNodeText("en-US", "root"),
      createdAt: originalRoot.createdAt,
      updatedAt: originalRoot.updatedAt,
    });
    expect(localized.tree.revision).toBe(fixture.tree.revision + 10);
    expect(canReplayTreeHistory(localized.tree, localized.history)).toBe(true);

    const repeated = relocalizeSeededSession(localized.tree, localized.history, "en-US");
    expect(repeated).toEqual({
      ok: true,
      changed: false,
      tree: localized.tree,
      history: localized.history,
      historyReleased: false,
    });
    if (!repeated.ok) return;
    expect(repeated.tree).toBe(localized.tree);
    expect(repeated.history).toBe(localized.history);
  });

  it("keeps a Branch node in its creation language across later locale changes", () => {
    const fixture = createSeededDocument();
    const command = createBranchChildCommand(
      fixture.tree,
      SEEDED_DOCUMENT_NODE_IDS.root,
      { nodeId: "person_branch", createdAt: "2026-08-24T00:00:00.000Z" },
      undefined,
      "en-US",
      seededBranchTexts,
    );
    const committed = commitTreeCommand(
      fixture.tree,
      fixture.history,
      command,
      TEST_HISTORY_LIMITS,
    );
    if (!committed.ok) throw new Error(committed.error.code);
    const branchText = committed.tree.nodes.person_branch.text;
    expect(branchText).toBe(seededBranchTexts("en-US", "root")[0]);

    const localized = relocalizeSeededSession(committed.tree, committed.history, "de-DE");
    if (!localized.ok) throw new Error(localized.errorCode);
    expect(localized.tree.nodes.person_branch.text).toBe(branchText);
    expect(localized.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root].text)
      .toBe(seededNodeText("de-DE", "root"));
    expect(canReplayTreeHistory(localized.tree, localized.history)).toBe(true);
  });

  it("detaches a seed passage after an exact text command and preserves its Undo", () => {
    const fixture = createSeededDocument();
    const root = fixture.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root];
    const editedText = "这是人已经改过、语言偏好不能触碰的内容。";
    const committed = commitTreeCommand(
      fixture.tree,
      fixture.history,
      {
        id: "human_seed_edit",
        source: "human",
        expectedTreeId: fixture.tree.id,
        expectedRevision: fixture.tree.revision,
        createdAt: "2026-08-24T00:01:00.000Z",
        mutation: {
          type: "replace-text",
          nodeId: root.id,
          expectedText: root.text,
          expectedUpdatedAt: root.updatedAt,
          text: editedText,
          updatedAt: "2026-08-24T00:01:00.000Z",
        },
      },
      TEST_HISTORY_LIMITS,
    );
    if (!committed.ok) throw new Error(committed.error.code);

    const localized = relocalizeSeededSession(committed.tree, committed.history, "en-US");
    if (!localized.ok) throw new Error(localized.errorCode);
    expect(localized.tree.nodes[root.id].text).toBe(editedText);
    expect(canReplayTreeHistory(localized.tree, localized.history)).toBe(true);

    const undone = undoTreeHistory(localized.tree, localized.history, TEST_HISTORY_LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    expect(undone.tree.nodes[root.id].text).toBe(seededNodeText("en-US", "root"));

    const relocalized = relocalizeSeededSession(undone.tree, undone.history, "de-DE");
    if (!relocalized.ok) throw new Error(relocalized.errorCode);
    expect(relocalized.tree.nodes[root.id].text).toBe(seededNodeText("de-DE", "root"));
    expect(canReplayTreeHistory(relocalized.tree, relocalized.history)).toBe(true);
  });

  it("keeps a long journal's objects when nothing reads differently in the language", () => {
    const fixture = createSeededDocument();
    const localized = relocalizeSeededSession(fixture.tree, fixture.history, "en-US");
    if (!localized.ok) throw new Error(localized.errorCode);
    const session = longTextJournal(localized.tree, localized.history, 1_000);

    const repeated = relocalizeSeededSession(session.tree, session.history, "en-US");
    expect(repeated).toMatchObject({ ok: true, changed: false, historyReleased: false });
    if (!repeated.ok) return;
    expect(repeated.tree).toBe(session.tree);
    expect(repeated.history).toBe(session.history);
  });

  it("translates the seed text an Undo restores even when no untouched passage is left", () => {
    // The root-only seed has one passage and no title; editing it leaves
    // nothing untouched in the material, only the memento that restores it.
    const fixture = createSeededDocument("root");
    const root = fixture.tree.nodes[fixture.tree.rootId!]!;
    const edited = commitTreeCommand(fixture.tree, fixture.history, {
      id: "human_root_edit",
      source: "human",
      expectedTreeId: fixture.tree.id,
      expectedRevision: fixture.tree.revision,
      createdAt: "2026-08-24T00:05:00.000Z",
      mutation: {
        type: "replace-text",
        nodeId: root.id,
        expectedText: root.text,
        expectedUpdatedAt: root.updatedAt,
        text: "我自己的话。",
        updatedAt: "2026-08-24T00:05:00.000Z",
      },
    }, TEST_HISTORY_LIMITS);
    if (!edited.ok) throw new Error(edited.error.code);

    const localized = relocalizeSeededSession(edited.tree, edited.history, "en-US");
    expect(localized).toMatchObject({ ok: true, changed: true, historyReleased: false });
    if (!localized.ok) return;
    expect(localized.tree).toBe(edited.tree);
    const undone = undoTreeHistory(localized.tree, localized.history, TEST_HISTORY_LIMITS);
    if (!undone.ok) throw new Error(undone.error.code);
    expect(undone.tree.nodes[root.id]).toMatchObject({
      text: seededNodeText("en-US", "root"),
      updatedAt: root.updatedAt,
    });
  });

  it("checks only the next Undo and Redo when a language change rewrites seed mementos", () => {
    const fixture = createSeededDocument();
    const session = longTextJournal(fixture.tree, fixture.history, 1_000);
    const started = performance.now();
    const localized = relocalizeSeededSession(session.tree, session.history, "de-DE");
    const elapsedMs = performance.now() - started;

    expect(localized).toMatchObject({ ok: true, changed: true, historyReleased: false });
    if (!localized.ok) return;
    expect(localized.history.entries).toHaveLength(session.history.entries.length);
    // Whole-journal replay measured seconds at this depth; tops-only is milliseconds.
    expect(elapsedMs).toBeLessThan(1_000);
    const undone = undoTreeHistory(localized.tree, localized.history, TEST_HISTORY_LIMITS);
    expect(undone.ok).toBe(true);
  });

  it("translates the seed even when a deeper journal step is stale, leaving it to fail at use", () => {
    const fixture = createSeededDocument();
    const command = createBranchChildCommand(
      fixture.tree,
      SEEDED_DOCUMENT_NODE_IDS.root,
      { nodeId: "bounded_branch", createdAt: "2026-08-24T00:02:00.000Z" },
    );
    const committed = commitTreeCommand(fixture.tree, fixture.history, command, TEST_HISTORY_LIMITS);
    if (!committed.ok) throw new Error(committed.error.code);
    const second = commitTreeCommand(
      committed.tree,
      committed.history,
      createBranchChildCommand(
        committed.tree,
        SEEDED_DOCUMENT_NODE_IDS.root,
        { nodeId: "second_branch", createdAt: "2026-08-24T00:03:00.000Z" },
      ),
      TEST_HISTORY_LIMITS,
    );
    if (!second.ok) throw new Error(second.error.code);
    const [oldest, newest] = second.history.entries;
    if (oldest === undefined || newest === undefined) throw new Error("two steps expected");
    const staleDeep = {
      ...second.history,
      entries: [{ ...oldest, inverse: { ...oldest.inverse, expectedTreeId: "elsewhere" } }, newest],
    };

    const localized = relocalizeSeededSession(second.tree, staleDeep, "en-US");
    expect(localized).toMatchObject({ ok: true, changed: true, historyReleased: false });
    if (!localized.ok) return;
    expect(localized.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root]?.text).toBe(seededNodeText("en-US", "root"));
    const first = undoTreeHistory(localized.tree, localized.history, TEST_HISTORY_LIMITS);
    if (!first.ok) throw new Error(first.error.code);
    expect(undoTreeHistory(first.tree, first.history, TEST_HISTORY_LIMITS)).toMatchObject({
      ok: false,
      error: { code: "HISTORY_UNAVAILABLE" },
    });
  });

  it("releases a stack whose next step no longer matches the translated seed, and says so", () => {
    const fixture = createSeededDocument();
    const command = createBranchChildCommand(
      fixture.tree,
      SEEDED_DOCUMENT_NODE_IDS.root,
      { nodeId: "bounded_branch", createdAt: "2026-08-24T00:02:00.000Z" },
    );
    const committed = commitTreeCommand(fixture.tree, fixture.history, command, TEST_HISTORY_LIMITS);
    if (!committed.ok) throw new Error(committed.error.code);
    const entry = committed.history.entries[0]!;
    const staleTop = {
      ...committed.history,
      entries: [{ ...entry, inverse: { ...entry.inverse, expectedTreeId: "elsewhere" } }],
    };

    const localized = relocalizeSeededSession(committed.tree, staleTop, "en-US");
    expect(localized).toMatchObject({ ok: true, changed: true, historyReleased: true });
    if (!localized.ok) return;
    expect(localized.history.entries).toEqual([]);
    expect(localized.tree.nodes[SEEDED_DOCUMENT_NODE_IDS.root]?.text).toBe(seededNodeText("en-US", "root"));
  });
});

/** Text steps on the one node that is never seed copy, so seed passages stay untouched. */
function longTextJournal(tree: ThoughtTree, history: TreeHistory, count: number) {
  let session = { tree, history };
  const command = createBranchChildCommand(
    tree,
    SEEDED_DOCUMENT_NODE_IDS.root,
    { nodeId: "journal_branch", createdAt: "2026-08-24T00:04:00.000Z" },
  );
  const branched = commitTreeCommand(tree, history, command, JOURNAL_LIMITS);
  if (!branched.ok) throw new Error(branched.error.code);
  session = branched;
  for (let step = 0; step < count - 1; step += 1) {
    const node = session.tree.nodes.journal_branch!;
    const result = commitTreeCommand(session.tree, session.history, {
      id: `journal_${step}`,
      source: "human",
      expectedTreeId: session.tree.id,
      expectedRevision: session.tree.revision,
      createdAt: node.updatedAt,
      mutation: {
        type: "replace-text",
        nodeId: node.id,
        expectedText: node.text,
        expectedUpdatedAt: node.updatedAt,
        text: `edit ${step} ${"y".repeat(300)}`,
        updatedAt: node.updatedAt,
      },
    }, JOURNAL_LIMITS);
    if (!result.ok) throw new Error(result.error.code);
    session = result;
  }
  return session;
}

const JOURNAL_LIMITS = { maxEntries: 1_000, maxRetainedInverseBytes: 32 * 1_024 * 1_024 };

const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

function graphemeLength(value: string): number {
  return [...GRAPHEME_SEGMENTER.segment(value)].length;
}
