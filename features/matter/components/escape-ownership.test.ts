import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Source-scan proof that `escape-layers.ts` is the only document-level Escape
// owner. A second listener that tests Escape reintroduces the bug this slice
// removed: one key closing several layers, or an IME candidate dismissal
// cancelling live work.
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SOURCE_DIRS = ["features", "app"];
const OWNER = "features/matter/components/escape-layers.ts";
const KEY_RULES = "features/matter/components/composition-safe-keys.ts";

type Source = Readonly<{ path: string; text: string; file: ts.SourceFile }>;

function sources(): readonly Source[] {
  const found: Source[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.(?:ts|tsx)$/u.test(entry.name) || /\.(?:test|spec)\./u.test(entry.name)) continue;
      const text = readFileSync(absolute, "utf8");
      found.push({
        path: relative(ROOT, absolute),
        text,
        file: ts.createSourceFile(entry.name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
      });
    }
  };
  for (const directory of SOURCE_DIRS) walk(join(ROOT, directory));
  return found;
}

type KeydownListener = Readonly<{ path: string; handlerText: string; options: string | null }>;

function keydownListeners(source: Source): readonly KeydownListener[] {
  const declarations = new Map<string, string[]>();
  const listeners: Array<Readonly<{ handler: ts.Expression; options: ts.Expression | undefined }>> = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      declarations.set(node.name.text, [...declarations.get(node.name.text) ?? [], node.initializer.getText()]);
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      declarations.set(node.name.text, [...declarations.get(node.name.text) ?? [], node.getText()]);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "addEventListener" &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0]!) &&
      node.arguments[0].text === "keydown"
    ) {
      listeners.push({ handler: node.arguments[1]!, options: node.arguments[2] });
    }
    ts.forEachChild(node, visit);
  };
  visit(source.file);
  return listeners.map(({ handler, options }) => ({
    path: source.path,
    handlerText: ts.isIdentifier(handler)
      ? (declarations.get(handler.text) ?? [handler.text]).join("\n")
      : handler.getText(),
    options: options?.getText() ?? null,
  }));
}

describe("one Escape owner", () => {
  const all = sources();

  it("scans the real tree", () => {
    expect(all.some((source) => source.path === OWNER)).toBe(true);
    expect(all.length).toBeGreaterThan(100);
  });

  it("owns exactly one bubble-phase window keydown listener", () => {
    const owner = all.find((source) => source.path === OWNER)!;
    const listeners = keydownListeners(owner);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]!.options).toBeNull();
    expect(owner.text).toContain('window.addEventListener("keydown", handleWindowKeydown)');
  });

  it("leaves no other keydown listener that tests Escape, captures, or stops propagation", () => {
    const offenders: string[] = [];
    for (const source of all) {
      if (source.path === OWNER) continue;
      for (const listener of keydownListeners(source)) {
        if (/["']Escape["']|isCancelEscape/u.test(listener.handlerText)) {
          offenders.push(`${listener.path}: keydown listener tests Escape`);
        }
        if (listener.options !== null) {
          offenders.push(`${listener.path}: keydown listener passes ${listener.options}`);
        }
        if (listener.handlerText.includes("stopPropagation")) {
          offenders.push(`${listener.path}: keydown listener stops propagation`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("routes every other Escape comparison through the composition-safe rule", () => {
    const offenders: string[] = [];
    for (const source of all) {
      if (source.path === KEY_RULES) continue;
      if (/\.key\s*[!=]==?\s*["']Escape["']|case\s+["']Escape["']/u.test(source.text)) {
        offenders.push(source.path);
      }
      if (/onKeyDownCapture/u.test(source.text)) offenders.push(`${source.path} (capture)`);
    }
    expect(offenders).toEqual([]);
  });
});
