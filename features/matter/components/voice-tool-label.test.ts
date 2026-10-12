import { describe, expect, it } from "vitest";
import { voiceToolLabel } from "./RootedMaterial";
import { voiceToolCopy } from "./voice-tool-copy";

const BASE = {
  anchor: { kind: "child", treeId: "tree_1", baseRevision: 1, parentNodeId: "a" },
  firstAdmission: false,
  isPreviewReady: true,
  isRecording: false,
  isVoiceChecking: false,
  locale: "en-US",
  navigationMode: "full",
  rewriteRecording: false,
  rewriteTargeted: false,
  rootId: "root",
} as const satisfies Parameters<typeof voiceToolLabel>[0];

const copy = voiceToolCopy("en-US");

describe("voiceToolLabel", () => {
  it("names a rewrite for a selected passage and an admission otherwise", () => {
    expect(voiceToolLabel({ ...BASE, rewriteTargeted: true })).toBe(copy.recordRewriteDirection);
    expect(voiceToolLabel(BASE)).toBe(copy.recordBelowSelectedMaterial);
  });

  it("says Stop while an admission records, even with a rewritable passage selected", () => {
    // Under records while its passage stays selected; the tool then stops it.
    expect(voiceToolLabel({ ...BASE, isRecording: true, rewriteTargeted: true }))
      .toBe(copy.stopRecording);
  });

  it("keeps Point and Talk's own recording label ahead of everything", () => {
    expect(voiceToolLabel({ ...BASE, rewriteRecording: true, rewriteTargeted: true }))
      .toBe(copy.stopRewriteDirection);
  });
});
