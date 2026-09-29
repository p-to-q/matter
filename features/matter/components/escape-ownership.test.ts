import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Source-scan proof that `escape-layers.ts` is the only document-level Escape
// owner. A second listener that tests Escape reintroduces the bug this slice
// removed: one key closing several layers, or an IME candidate dismissal
// cancelling live work. The scan is deliberately conservative: a keydown
// listener whose handler cannot be resolved to source is itself an offence.
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SOURCE_DIRS = ["features", "app"];
const OWNER = "features/matter/components/escape-layers.ts";
// Only the key rules themselves and the grip's pure key reducer (which is fed
// by the focused grip) may compare a key value with "Escape".
const KEY_VOCABULARY = new Set([
  "features/matter/components/composition-safe-keys.ts",
  "features/matter/runtime/stretch-interaction.ts",
]);

type Source = Readonly<{ path: string; text: string; file: ts.SourceFile }>;
type Tree = ReadonlyMap<string, Source>;

function parseTree(files: ReadonlyMap<string, string>): Tree {
  const tree = new Map<string, Source>();
  for (const [path, text] of files) {
    tree.set(path, {
      path,
      text,
      file: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    });
  }
  return tree;
}

function realTree(): Tree {
  const files = new Map<string, string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.(?:ts|tsx)$/u.test(entry.name) || /\.(?:test|spec)\./u.test(entry.name)) continue;
      files.set(relative(ROOT, absolute), readFileSync(absolute, "utf8"));
    }
  };
  for (const directory of SOURCE_DIRS) walk(join(ROOT, directory));
  return parseTree(files);
}

/** Declarations visible by name in one file: local bindings and imports. */
function declarationText(tree: Tree, source: Source, name: string, depth = 0): string | null {
  if (depth > 4) return null;
  const found: string[] = [];
  let imported: Readonly<{ specifier: string; name: string }> | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name &&
      node.initializer !== undefined) {
      found.push(node.initializer.getText());
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node.getText());
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.name?.text === name) imported = { specifier: node.moduleSpecifier.text, name: "default" };
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.name.text === name) {
            imported = {
              specifier: node.moduleSpecifier.text,
              name: element.propertyName?.text ?? element.name.text,
            };
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source.file);
  if (found.length > 0) return found.join("\n");
  if (imported === null) return null;
  const { specifier, name: importedName } = imported as Readonly<{ specifier: string; name: string }>;
  if (!specifier.startsWith(".")) return null;
  const base = normalize(join(dirname(source.path), specifier));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    const target = tree.get(candidate);
    if (target !== undefined) return declarationText(tree, target, importedName, depth + 1);
  }
  return null;
}

function handlerText(tree: Tree, source: Source, handler: ts.Expression): string | null {
  if (ts.isIdentifier(handler)) return declarationText(tree, source, handler.text);
  if (
    ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) || ts.isCallExpression(handler)
  ) return handler.getText();
  return null;
}

type Handler = Readonly<{ kind: "dom" | "react"; site: string; text: string | null; options: string | null }>;

function keydownHandlers(tree: Tree, source: Source): readonly Handler[] {
  const handlers: Handler[] = [];
  const site = (node: ts.Node) =>
    `${source.path}:${source.file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "addEventListener" &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0]!) &&
      node.arguments[0].text === "keydown"
    ) {
      handlers.push({
        kind: "dom",
        site: site(node),
        text: handlerText(tree, source, node.arguments[1]!),
        options: node.arguments[2]?.getText() ?? null,
      });
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === "onkeydown"
    ) {
      handlers.push({ kind: "dom", site: site(node), text: handlerText(tree, source, node.right), options: null });
    }
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === "onKeyDown" || node.name.text === "onKeyDownCapture") &&
      node.initializer !== undefined &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression !== undefined
    ) {
      handlers.push({
        kind: "react",
        site: site(node),
        text: handlerText(tree, source, node.initializer.expression),
        options: node.name.text === "onKeyDownCapture" ? "capture" : null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source.file);
  return handlers;
}

const TESTS_ESCAPE = /["']Esc(?:ape)?["']|isCancelEscape|\b(?:keyCode|which)\s*[!=]==?\s*27\b/u;
const COMPARES_ESCAPE = [
  /\b(?:key|code)\s*[!=]==?\s*["']Esc(?:ape)?["']/u,
  /["']Esc(?:ape)?["']\s*[!=]==?\s*[\w.]*\b(?:key|code)\b/u,
  /case\s+["']Esc(?:ape)?["']/u,
  /\b(?:keyCode|which)\s*[!=]==?\s*27\b/u,
];

function offenders(tree: Tree): readonly string[] {
  const found: string[] = [];
  for (const source of tree.values()) {
    for (const handler of keydownHandlers(tree, source)) {
      if (handler.text === null) {
        found.push(`${handler.site}: keydown handler cannot be resolved to source`);
        continue;
      }
      if (handler.options !== null) found.push(`${handler.site}: keydown handler runs in the capture phase`);
      if (/\bstop(?:Immediate)?Propagation\b/u.test(handler.text)) {
        found.push(`${handler.site}: keydown handler stops propagation`);
      }
      if (handler.kind === "dom" && source.path !== OWNER && TESTS_ESCAPE.test(handler.text)) {
        found.push(`${handler.site}: keydown listener tests Escape outside the owner`);
      }
    }
    if (!KEY_VOCABULARY.has(source.path) && COMPARES_ESCAPE.some((pattern) => pattern.test(source.text))) {
      found.push(`${source.path}: compares a key with Escape instead of isCancelEscape`);
    }
  }
  return found;
}

function virtualTree(files: Record<string, string>): Tree {
  return parseTree(new Map(Object.entries(files)));
}

describe("one Escape owner", () => {
  const tree = realTree();

  it("scans the real tree", () => {
    expect(tree.has(OWNER)).toBe(true);
    expect(tree.size).toBeGreaterThan(100);
  });

  it("owns exactly one bubble-phase window keydown listener", () => {
    const owner = tree.get(OWNER)!;
    const handlers = keydownHandlers(tree, owner);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!.options).toBeNull();
    expect(owner.text).toContain('window.addEventListener("keydown", handleWindowKeydown)');
  });

  it("finds no other Escape listener, capture, stopped keydown, or raw Escape comparison", () => {
    expect(offenders(tree)).toEqual([]);
  });

  it("keeps the submitted Elastic degree below any surface that covers the paper", () => {
    const rooted = tree.get("features/matter/components/RootedMaterial.tsx")!.text;
    expect(rooted).toMatch(
      /useEscapeLayer\(\s*transformState\.phase === "requesting" && canvasOverlay === null && !indexOverlayOpen,\s*"transient",/u,
    );
  });
});

describe("the ownership scan catches regressions", () => {
  const clean = `
    import { isCancelEscape } from "./composition-safe-keys";
    export function Field() {
      return <input onKeyDown={(event) => {
        if (isCancelEscape(event.nativeEvent)) event.preventDefault();
      }} />;
    }
  `;

  it("accepts a focused field that claims Escape with preventDefault only", () => {
    expect(offenders(virtualTree({ "features/field.tsx": clean }))).toEqual([]);
  });

  it.each([
    ["a React onKeyDown that stops propagation", {
      "features/a.tsx": `export const A = () => <div onKeyDown={(event) => event.stopPropagation()} />;`,
    }, "stops propagation"],
    ["a named React handler that stops propagation", {
      "features/a.tsx": `
        const handle = (event) => { event.stopPropagation(); };
        export const A = () => <div onKeyDown={handle} />;
      `,
    }, "stops propagation"],
    ["a capture-phase React handler", {
      "features/a.tsx": `export const A = () => <div onKeyDownCapture={(event) => event.preventDefault()} />;`,
    }, "capture phase"],
    ["an imported document handler reading a destructured key", {
      "features/a.ts": `
        import { onKey } from "./keys";
        document.addEventListener("keydown", onKey);
      `,
      "features/keys.ts": `
        export function onKey(event: KeyboardEvent) {
          const { key } = event;
          if (key === "Escape") close();
        }
      `,
    }, "tests Escape outside the owner"],
    ["a code comparison", {
      "features/a.ts": `export const isEscape = (event: KeyboardEvent) => event.code === "Escape";`,
    }, "compares a key with Escape"],
    ["a capture-phase window listener", {
      "features/a.ts": `window.addEventListener("keydown", (event) => event.preventDefault(), { capture: true });`,
    }, "capture phase"],
    ["an onkeydown property handler", {
      "features/a.ts": `element.onkeydown = (event) => { if (event.keyCode === 27) close(); };`,
    }, "tests Escape outside the owner"],
    ["an unresolvable listener", {
      "features/a.ts": `window.addEventListener("keydown", handlers.escape);`,
    }, "cannot be resolved"],
  ] as const)("flags %s", (_name, files, reason) => {
    const found = offenders(virtualTree(files));
    expect(found.some((offence) => offence.includes(reason))).toBe(true);
  });
});
