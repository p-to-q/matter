import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { projectToolSurface } from "../tools/project-tool-surface";
import { projectTools } from "../tools/project-tools";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import { ToolRail, type ToolRailProps } from "./ToolRail";
import { toolRailCopy } from "./tool-rail-copy";

const EXPECTED_RAIL_IDS = ["voice", "lasso", "branch", "move", "undo"];

describe("ToolRail", () => {
  it.each([
    {
      name: "selected branch",
      context: {
        view: "full" as const,
        selected: { nodeId: "branch", hasChildren: true, isFolded: false },
        canUndo: true,
        interaction: "idle" as const,
      },
    },
    {
      name: "focused thought",
      context: {
        view: "focus" as const,
        selected: { nodeId: "branch", hasChildren: true, isFolded: false },
        canUndo: false,
        interaction: "idle" as const,
      },
    },
  ])("keeps the fixed editing controls for $name", ({ context }) => {
    const markup = renderToolRail({
      surface: projectToolSurface(projectTools(context)),
    });

    expect(toolIds(markup)).toEqual(EXPECTED_RAIL_IDS);
    expect(markup).not.toMatch(/data-tool-id="(?:focus|fold|unfold|show-all)"/);
    expect(markup).toContain('aria-label="Editing tools"');
  });

  it("exposes semantic names for voice, selection, generation, movement, and undo", () => {
    const markup = renderToolRail({
      lassoActive: true,
      surface: projectToolSurface(projectTools({
        view: "full",
        selected: { nodeId: "branch", hasChildren: true, isFolded: false },
        canUndo: true,
        interaction: "idle",
      })),
    });

    expect(markup).toContain('aria-label="Record a top-level thought"');
    expect(markup).toContain('aria-label="Exit language selection"');
    expect(markup).toContain('aria-label="Extend related thought"');
    expect(markup).toContain('aria-label="Return to canvas pan"');
    expect(markup).toContain('aria-label="Undo last change"');
    expect(markup).not.toContain("Redo");
  });

  it("keeps the recording control available to finish", () => {
    const markup = renderToolRail({
      interactionPending: true,
      voiceActive: true,
      voiceLabel: "Finish recording",
    });

    expect(markup).toContain('aria-label="Finish recording"');
    expect(markup).not.toMatch(/data-tool-id="voice"[^>]*disabled/);
  });

  it.each(CANVAS_LANGUAGE_OPTIONS)("renders fixed controls in $label", ({ value: locale }) => {
    const copy = toolRailCopy(locale);
    const markup = renderToolRail({ locale, voiceLabel: copy.voice });

    expect(markup).toContain(`aria-label="${copy.editingTools}"`);
    expect(markup).toContain(`aria-label="${copy.circleSelectLanguage}"`);
    expect(markup).toContain(`aria-label="${copy.extendRelatedThought}"`);
    expect(markup).toContain(`aria-label="${copy.canvasPan}"`);
    expect(markup).toContain(`aria-label="${copy.undoLastChange}"`);
    expect(markup).toContain(`>${copy.voice}</span>`);
    expect(markup).toContain(`>${copy.lasso}</span>`);
    expect(markup).toContain(`>${copy.branch}</span>`);
    expect(markup).toContain(`>${copy.pan}</span>`);
    expect(markup).toContain(`>${copy.undo}</span>`);
  });
});

function renderToolRail(overrides: Partial<ToolRailProps>): string {
  const props: ToolRailProps = {
    interactionPending: false,
    lassoActive: false,
    lassoAvailable: true,
    locale: "en-US",
    onIntent: vi.fn(),
    onLasso: vi.fn(),
    onMove: vi.fn(),
    onVoice: vi.fn(),
    panActive: false,
    surface: projectToolSurface(projectTools({
      view: "full",
      selected: null,
      canUndo: false,
      interaction: "idle",
    })),
    voiceActive: false,
    voiceAvailable: true,
    voiceLabel: "Record a top-level thought",
    ...overrides,
  };

  return renderToStaticMarkup(createElement(ToolRail, props));
}

function toolIds(markup: string): string[] {
  return Array.from(markup.matchAll(/data-tool-id="([^"]+)"/g), (match) => match[1]!);
}
