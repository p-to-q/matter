import { describe, expect, it } from "vitest";
import { projectLanguageAroundSelection } from "./language-projection";

const nodeId = "node_a";

describe("language projection", () => {
  it("splits a middle selection and keeps its outer punctuation seam attached", () => {
    expect(projectLanguageAroundSelection("前面，选中内容。后面。", {
      type: "segment-range",
      nodeId,
      start: 3,
      end: 7,
      selectedText: "选中内容",
    })).toEqual({
      ok: true,
      projection: {
        before: "前面，",
        selected: "选中内容",
        outerSeam: "。",
        selectedWithSeam: "选中内容。",
        after: "后面。",
        hasBefore: true,
        hasAfter: true,
      },
    });
  });

  it("does not invent missing before or after material", () => {
    expect(projectLanguageAroundSelection("开头。结尾。", {
      type: "segment-range", nodeId, start: 0, end: 2, selectedText: "开头",
    })).toMatchObject({ ok: true, projection: { before: "", after: "结尾。", hasBefore: false, hasAfter: true } });
    expect(projectLanguageAroundSelection("开头。结尾。", {
      type: "segment-range", nodeId, start: 3, end: 5, selectedText: "结尾",
    })).toMatchObject({ ok: true, projection: { before: "开头。", after: "", hasBefore: true, hasAfter: false } });
  });

  it("preserves internal seams when adjacent segments merge", () => {
    expect(projectLanguageAroundSelection("第一句，第二句。第三句。", {
      type: "segment-range", nodeId, start: 0, end: 7, selectedText: "第一句，第二句",
    })).toMatchObject({
      ok: true,
      projection: { before: "", selectedWithSeam: "第一句，第二句。", after: "第三句。" },
    });
  });

  it("rejects stale, partial, and non-segment addresses", () => {
    expect(projectLanguageAroundSelection("第一句。", {
      type: "segment-range", nodeId, start: 0, end: 2, selectedText: "过期",
    })).toEqual({ ok: false, error: "INVALID_SELECTION" });
    expect(projectLanguageAroundSelection("第一句。", {
      type: "segment-range", nodeId, start: 1, end: 3, selectedText: "一句",
    })).toEqual({ ok: false, error: "INVALID_SELECTION" });
  });
});

