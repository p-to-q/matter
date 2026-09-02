import { describe, expect, it } from "vitest";
import {
  projectLanguageAroundSelection,
  projectMaterialAddressTextRange,
} from "./language-projection";

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
        visibleOuterSeam: "。",
        outerSeamTail: "",
        addressText: "选中内容。",
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

  it("projects an adjacent multi-segment range and keeps only its outer seam", () => {
    expect(projectLanguageAroundSelection("第一句，第二句。第三句。", {
      type: "segment-range", nodeId, start: 0, end: 7, selectedText: "第一句，第二句",
    })).toEqual({
      ok: true,
      projection: {
        before: "",
        selected: "第一句，第二句",
        outerSeam: "。",
        visibleOuterSeam: "。",
        outerSeamTail: "",
        addressText: "第一句，第二句。",
        selectedWithSeam: "第一句，第二句。",
        after: "第三句。",
        hasBefore: false,
        hasAfter: true,
      },
    });
  });

  it("rejects stale text and arbitrary partial ranges", () => {
    expect(projectLanguageAroundSelection("第一句。", {
      type: "segment-range", nodeId, start: 0, end: 2, selectedText: "过期",
    })).toEqual({ ok: false, error: "INVALID_SELECTION" });
    expect(projectLanguageAroundSelection("第一句。", {
      type: "segment-range", nodeId, start: 1, end: 3, selectedText: "一句",
    })).toEqual({ ok: false, error: "INVALID_SELECTION" });
  });

  it("paints visible punctuation but leaves trailing whitespace to flow", () => {
    const text = "甲。\t\r\n乙。";
    const selection = {
      type: "segment-range" as const,
      nodeId,
      start: 0,
      end: 1,
      selectedText: "甲",
    };

    expect(projectLanguageAroundSelection(text, selection)).toMatchObject({
      ok: true,
      projection: {
        outerSeam: "。\t\r\n",
        visibleOuterSeam: "。",
        outerSeamTail: "\t\r\n",
        addressText: "甲。",
        selectedWithSeam: "甲。\t\r\n",
      },
    });
    expect(projectMaterialAddressTextRange(text, selection)).toEqual({
      ok: true,
      range: { start: 0, end: 2, selectedText: "甲。" },
    });
  });

  it("keeps terminal runs and closing punctuation inside the visible address", () => {
    const text = "他说：测试？！”）  后面。";
    const selection = {
      type: "segment-range" as const,
      nodeId,
      start: 3,
      end: 5,
      selectedText: "测试",
    };

    expect(projectMaterialAddressTextRange(text, selection)).toEqual({
      ok: true,
      range: { start: 3, end: 9, selectedText: "测试？！”）" },
    });
  });

  it("does not widen the address when a seam contains only whitespace", () => {
    const text = "甲\n乙。";
    const selection = {
      type: "segment-range" as const,
      nodeId,
      start: 0,
      end: 1,
      selectedText: "甲",
    };

    expect(projectMaterialAddressTextRange(text, selection)).toEqual({
      ok: true,
      range: { start: 0, end: 1, selectedText: "甲" },
    });
  });
});
