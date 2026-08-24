import { describe, expect, it } from "vitest";
import { MATTER_LOCALES } from "../config/locales";
import {
  canReplayTreeHistory,
  commitTreeCommand,
  estimateSerializedInverseBytes,
  undoTreeHistory,
} from "../tree/history";
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
  seededNodeText,
} from "./seeded-material-copy";
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
      for (const key of SEEDED_PASSAGE_KEYS) {
        expect(copy.nodes[key].trim()).not.toBe("");
        expect(seededBranchTexts(locale, key).length).toBeGreaterThan(0);
      }
      expect(seededFallbackBranchTexts(locale).every((text) => text.trim().length > 0))
        .toBe(true);
      expect(seededBranchTexts(locale, "root")[0])
        .toBe(seededFallbackBranchTexts(locale)[0]);
    }
    for (const key of SEEDED_PASSAGE_KEYS) {
      expect(seededInitialNodeText(key)).toBe(seededNodeText("zh-CN", key));
    }
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

    const undone = undoTreeHistory(localized.tree, localized.history);
    if (!undone.ok) throw new Error(undone.error.code);
    expect(undone.tree.nodes[root.id].text).toBe(root.text);
  });

  it("rejects an inexact journal rather than repairing or partially localizing it", () => {
    const fixture = createSeededDocument();
    const command = createBranchChildCommand(
      fixture.tree,
      SEEDED_DOCUMENT_NODE_IDS.root,
      { nodeId: "bounded_branch", createdAt: "2026-08-24T00:02:00.000Z" },
    );
    const committed = commitTreeCommand(
      fixture.tree,
      fixture.history,
      command,
      TEST_HISTORY_LIMITS,
    );
    if (!committed.ok) throw new Error(committed.error.code);
    const entry = committed.history.entries[0];
    const corruptHistory = {
      ...committed.history,
      entries: [{
        ...entry,
        retainedInverseBytes: estimateSerializedInverseBytes(entry.inverse) + 1,
      }],
      retainedInverseBytes: committed.history.retainedInverseBytes + 1,
    };

    expect(relocalizeSeededSession(committed.tree, corruptHistory, "en-US"))
      .toMatchObject({
        ok: false,
        errorCode: "SEED_LOCALIZATION_INVALID_HISTORY",
        tree: committed.tree,
        history: corruptHistory,
      });
  });
});
