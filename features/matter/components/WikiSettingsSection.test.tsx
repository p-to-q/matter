import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WikiSettingsSection } from "./WikiSettingsSection";

describe("WikiSettingsSection", () => {
  it("keeps every locale's copy complete instead of spreading another language", () => {
    const source = readFileSync(new URL("./WikiSettingsSection.tsx", import.meta.url), "utf8");
    // A spread lets a missing key fall back to English or Simplified Chinese
    // without failing the type check.
    expect(source).not.toMatch(/Object\.freeze\(\{\s*\.\.\.[A-Z_]+,/u);
    for (const [language, filterLabel] of [
      ["zh-TW", "詞條來源"],
      ["ja-JP", "追加元"],
      ["de-DE", "Herkunft der Wörter"],
    ] as const) {
      const markup = renderToStaticMarkup(createElement(WikiSettingsSection, { active: false, language }));
      expect(markup).toContain(filterLabel);
    }
  });

  it("presents a natural canonical-word dictionary without rule plumbing", () => {
    const markup = renderToStaticMarkup(createElement(WikiSettingsSection, {
      active: false,
      language: "zh-CN",
    }));
    const source = readFileSync(new URL("./WikiSettingsSection.tsx", import.meta.url), "utf8");

    expect(markup).toContain('aria-label="词典 WIKI"');
    expect(markup).toContain("只有已验证并发布的本地规则可以改写材料");
    expect(markup).toContain("关闭收词");
    expect(markup).toContain("关闭近音");
    expect(source).not.toContain("aria-pressed={capabilityPreferences");
    expect(markup).toContain("自动添加");
    expect(markup).toContain("手动添加");
    expect(source).toContain('scope: "可用于"');
    expect(source).toContain('scopeBoth: "所有文字"');
    expect(source).toContain('scopeSpoken: "语音输入"');
    expect(source).toContain('scopeWritten: "生成内容"');
    expect(source).not.toContain("WORD_EXAMPLES");
    expect(source).not.toContain("Morphogenesis");
    expect(source).not.toContain("Engelbart");
    expect(source).not.toContain('canonical: "KFC"');
    expect(source).not.toContain("[p → q]");
    expect(source).not.toContain("OriginIcon");
    expect(source).toContain('aria-label={copy.add}');
    expect(source).toContain("copy.export");
    expect(source).toContain("TRANSIENT_NOTICE_MS = 1_800");
    expect(source).toContain("EXPORT_CONFIRMATION_MS = 900");
    expect(source).toContain('restoreFocusRuleRef.current = editor.before?.id ?? "add"');
    expect(source).toContain("addButtonRef.current?.focus()");
    expect(source).toContain("useDeferredValue(query)");
    expect(source).not.toContain("听到或写出的形式");
    expect(source).not.toContain("清空词典");
    expect(source).not.toContain("confidence");
    expect(source).not.toContain('name="language"');
    expect(source).toContain("snapshot.rules.length > 6 || query.length > 0");
  });

  it("keeps mobile controls touch-sized and makes removal an explicit detail action", () => {
    const css = readFileSync(
      new URL("./WikiSettingsSection.module.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*min-height: 44px;/s);
    expect(css).toContain(".editorRemove");
    // Hover affordances exist only where a pointer can hover; touch keeps no
    // sticky hover state after a tap.
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.rules li:hover \{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.tileActions button:hover \{[^}]*background:\s*var\(--chrome-primary\)/s);
    expect(css).toMatch(/first-child\[aria-pressed="true"\]::after[\s\S]*transform:\s*scale\(1\)/s);
    expect(css).toMatch(/\.editor input,[\s\S]*\.search input\s*\{\s*font-size:\s*16px;/s);
    expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.tileActions\s*\{\s*display:\s*none;/s);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;/s);
    expect(css).toMatch(/\.exportButton\s*\{[\s\S]*display:\s*grid;/s);
    expect(css).toContain('.exportLabel[data-active="false"]');
    expect(css).toMatch(/\.capabilityActions button\s*{[^}]*text-decoration:\s*underline/s);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.capabilityActions button:hover \{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/\.section\s*\{[^}]*min-height:\s*287px;/s);
    expect(css).toMatch(/\.browser\s*\{[^}]*min-height:\s*263px;/s);
  });
});
