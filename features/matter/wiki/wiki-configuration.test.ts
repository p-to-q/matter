import { describe, expect, it } from "vitest";
import { applyWikiEvent, createEmptyWikiState } from "./wiki-evidence";
import {
  deriveWikiBoundary,
  projectWikiConfigurationRules,
} from "./wiki-configuration";

describe("Wiki configuration projection", () => {
  it("derives matcher grammar without making it a UI setting", () => {
    expect(deriveWikiBoundary("en-US", "code x")).toBe("word");
    expect(deriveWikiBoundary("de-DE", "Code-X")).toBe("word");
    expect(deriveWikiBoundary("en-US", "C++")).toBe("literal");
    expect(deriveWikiBoundary("zh-CN", "科德克斯")).toBe("literal");
    expect(deriveWikiBoundary("ja-JP", "コーデックス")).toBe("literal");
  });

  it("projects one canonical lexeme without exposing internal alias channels", () => {
    const confirmed = applyWikiEvent(createEmptyWikiState(), {
      type: "confirm-rule",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "code x",
      canonical: "Codex",
    });
    if (!confirmed.ok) throw new Error(confirmed.error.message);

    const second = applyWikiEvent(confirmed.state, {
      type: "confirm-rule",
      locale: "en-US",
      channel: "written",
      boundary: "word",
      form: "code-ex",
      canonical: "Codex",
    });
    if (!second.ok) throw new Error(second.error.message);

    expect(projectWikiConfigurationRules(second.state)).toEqual([{
      id: "1",
      lexemeId: 1,
      locale: "en-US",
      canonical: "Codex",
      scope: "both",
      origin: "confirmed",
    }]);
    expect(JSON.stringify(projectWikiConfigurationRules(second.state)))
      .not.toMatch(/alias|form|boundary|channel|score|counts|tombstone/);
  });

  it("shows a manually added lexeme before it has any alias", () => {
    const created = applyWikiEvent(createEmptyWikiState(), {
      type: "create-lexeme",
      locale: "en-US",
      canonical: "Engelbart",
      scope: "both",
    });
    if (!created.ok) throw new Error(created.error.message);

    expect(projectWikiConfigurationRules(created.state)).toEqual([
      expect.objectContaining({ canonical: "Engelbart" }),
    ]);
  });
});
