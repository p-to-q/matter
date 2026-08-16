#!/usr/bin/env node
/**
 * Holds the architecture fitness rules that are syntactic enough to hold.
 *
 * `docs/engineering.md` says a dependency rule stops being prose once it is
 * stable: "encode it in `npm run check`; prose and review are not its final
 * enforcement mechanism." These were prose for as long as the tree had
 * exceptions to them, because a check that fails on the day it lands is a check
 * someone silences. The exceptions are gone, so the rules can be held.
 *
 * Deliberately narrow. It reads static import specifiers only, and it does not
 * try to be a type system, a layering framework, or a lint plugin. Every rule
 * here answers a question that has already cost this repository something.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_ROOTS = ["features", "app", "scripts"];
const SOURCE_FILE = /\.(?:ts|tsx|mjs)$/u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

/**
 * Layers, innermost first. A file may import its own layer and any layer to its
 * left; reaching right is an inner layer depending on an outer one, which is
 * the direction that makes a domain untestable and a component unavoidable.
 *
 * `protocol` sits beside `tree` and `material` rather than inside `server`,
 * because the browser and the route parse the same envelope. It may not import
 * either side of the wire it describes.
 */
export const LAYERS = Object.freeze([
  { name: "tree", dirs: ["features/matter/tree"] },
  { name: "material", dirs: ["features/matter/material", "features/matter/config"] },
  { name: "protocol", dirs: ["features/matter/protocol"] },
  { name: "domain", dirs: ["features/matter/runtime", "features/matter/tools", "features/matter/layout"] },
  { name: "adapter", dirs: ["features/matter/server", "features/matter/persistence", "features/matter/interaction"] },
  { name: "store", dirs: ["features/matter/store"] },
  { name: "composition", dirs: ["features/matter/components", "app"] },
]);

const PROVIDER_MODULE = "features/matter/server/model-pool.ts";

/**
 * Static value specifiers only.
 *
 * A dynamic import is a runtime decision rather than a shape, and `import type`
 * is erased before anything runs — the rule these serve is about the *runtime*
 * graph, so counting a type-only edge would report a dependency the built
 * output does not contain. A type-only import pointing the wrong way is still
 * worth noticing in review; it is simply not this check's claim.
 */
export function importsOf(source) {
  const specifiers = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/gu;
  for (const [, typeKeyword, clause, specifier] of source.matchAll(pattern)) {
    if (typeKeyword !== undefined) continue;
    // `import { type A, type B }` erases entirely too; `import { type A, b }`
    // does not. Strip every inline `type` binding and see if anything is left.
    const braced = /^\{([^}]*)\}$/u.exec(clause.trim());
    if (braced !== null) {
      const values = braced[1]
        .split(",")
        .map((binding) => binding.trim())
        .filter((binding) => binding.length > 0 && !binding.startsWith("type "));
      if (values.length === 0) continue;
    }
    specifiers.push(specifier);
  }
  // A bare side-effect import is a real runtime edge with no bindings at all.
  for (const [, specifier] of source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/gu)) {
    specifiers.push(specifier);
  }
  return specifiers;
}

export function layerOf(file) {
  for (let index = LAYERS.length - 1; index >= 0; index -= 1) {
    if (LAYERS[index].dirs.some((dir) => file.startsWith(`${dir}/`))) return index;
  }
  return null;
}

/**
 * @param graph {Map<string, readonly string[]>} resolved repo-relative edges.
 * @returns {readonly string[]} one line per violation, empty when the shape holds.
 */
export function findProblems(graph) {
  const problems = [];

  for (const [file, targets] of graph) {
    if (TEST_FILE.test(file)) continue;

    // 1. Layers point inward.
    const from = layerOf(file);
    if (from !== null) {
      for (const target of targets) {
        const to = layerOf(target);
        if (to !== null && to > from) {
          problems.push(
            `${file} (${LAYERS[from].name}) imports ${target} (${LAYERS[to].name}). ` +
            `A ${LAYERS[from].name} module must not depend on ${LAYERS[to].name} code.`,
          );
        }
      }
    }

    // 2. The protocol is neutral: it describes the wire, it does not use it.
    if (file.startsWith("features/matter/protocol/")) {
      for (const target of targets) {
        if (
          target.startsWith("features/matter/server/") ||
          target.startsWith("features/matter/interaction/")
        ) {
          problems.push(
            `${file} imports ${target}. A wire contract must not depend on either side of its own wire.`,
          );
        }
      }
    }

    // 3. Nothing outside `server/` reaches a provider, so a relay host, key, or
    //    model name has exactly one place in the tree it can appear. The bound
    //    is the directory rather than the route: a route delegates to its
    //    harness, and both are server-only code that never reaches a browser
    //    bundle. What matters is that nothing outside them can.
    if (targets.includes(PROVIDER_MODULE) && !file.startsWith("features/matter/server/")) {
      problems.push(`${file} imports the model pool. Only features/matter/server/ may reach a provider.`);
    }
  }

  // 4. No cycles. A cycle means neither module can be understood, tested, or
  //    replaced without the other, whatever the layer table says.
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map([...graph.keys()].map((file) => [file, WHITE]));
  const stack = [];
  const reported = new Set();

  const visit = (file) => {
    colour.set(file, GREY);
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      if (TEST_FILE.test(target)) continue;
      const state = colour.get(target);
      if (state === GREY) {
        const cycle = [...stack.slice(stack.indexOf(target)), target];
        const key = [...cycle].sort().join(" ");
        if (!reported.has(key)) {
          reported.add(key);
          problems.push(`import cycle: ${cycle.join(" -> ")}`);
        }
      } else if (state === WHITE) {
        visit(target);
      }
    }
    stack.pop();
    colour.set(file, BLACK);
  };

  for (const file of graph.keys()) {
    if (!TEST_FILE.test(file) && colour.get(file) === WHITE) visit(file);
  }

  return problems;
}

function sourceFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const rel = `${dir}/${entry}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (SOURCE_FILE.test(entry)) found.push(rel);
    }
  };
  for (const root of SOURCE_ROOTS) walk(root);
  return found;
}

function resolveLocal(file, specifier) {
  // `@/*` maps to the repository root through tsconfig paths. Dropping those
  // edges would leave the graph silently incomplete, and silence is the worst
  // failure available here: the provider and layering rules are direct path
  // checks, so an aliased import passes every rule by never appearing at all,
  // while the console still reports no leak and no cycle.
  const aliased = specifier.startsWith("@/");
  if (!aliased && !specifier.startsWith(".")) return null;
  const target = aliased
    ? resolve(ROOT, specifier.slice(2))
    : resolve(ROOT, dirname(file), specifier);
  const base = relative(ROOT, target).replaceAll("\\", "/");
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}/index.ts`]) {
    try {
      if (statSync(join(ROOT, candidate)).isFile()) return candidate;
    } catch {
      // Not this extension.
    }
  }
  return base;
}

export function buildRepositoryGraph() {
  const files = sourceFiles();
  const known = new Set(files);
  return new Map(files.map((file) => [
    file,
    importsOf(readFileSync(join(ROOT, file), "utf8"))
      .map((specifier) => resolveLocal(file, specifier))
      .filter((target) => target !== null && known.has(target)),
  ]));
}

if (process.argv[1] === import.meta.filename) {
  const graph = buildRepositoryGraph();
  const problems = findProblems(graph);
  if (problems.length > 0) {
    console.error("architecture: the import graph does not hold its shape\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      "\nSee docs/engineering.md, 'Architecture fitness'. If a rule should change,\n" +
      "change the rule and say why in docs/changes.md — do not route around it.",
    );
    process.exit(1);
  }
  console.log(
    `architecture: ${graph.size} files, ${LAYERS.length} layers, ` +
    "no outward dependency, no provider leak, no cycle",
  );
}
