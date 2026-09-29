import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  POINT_TALK_CLOSE_REASONS,
  pointTalkPresenceClose,
  pointTalkReleaseReason,
} from "./point-talk-close";
import { POINT_TALK_PRESENCE_POLICY } from "./presence";

// Source-scan proof that the Point and Talk field leaves only for a reason in
// `point-talk-close.ts`. The field once vanished on relayout, re-measurement,
// a scroll inside its own input, or a lost placement, each through a path that
// named no reason. Every close now goes through the host's one closer with a
// literal reason, and nothing else may hide the field or declare its exit.
const HOST = "RootedMaterial.tsx";
const TURN = "PointTalkTurn.tsx";
const COMPOSER = "PointTalkComposer.tsx";

function parse(name: string): ts.SourceFile {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  return ts.createSourceFile(name, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function calls(file: ts.SourceFile, matches: (callee: string) => boolean): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && matches(node.expression.getText(file).replace(/\?\./gu, "."))) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The name of the innermost `const name = …` declaration holding `node`. */
function enclosingDeclaration(node: ts.Node): string | null {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
  }
  return null;
}

function literalReason(file: ts.SourceFile, call: ts.CallExpression): string | null {
  const [argument, ...rest] = call.arguments;
  if (argument === undefined || rest.length > 0) return null;
  if (ts.isStringLiteral(argument)) return argument.text;
  // `condition ? "a" : "b"` names two reasons, each checked.
  if (ts.isConditionalExpression(argument) &&
    ts.isStringLiteral(argument.whenTrue) && ts.isStringLiteral(argument.whenFalse)) {
    return `${argument.whenTrue.text}|${argument.whenFalse.text}`;
  }
  return `<${argument.getText(file)}>`;
}

describe("Point and Talk close reasons", () => {
  it("are exactly the five the person can see", () => {
    expect(POINT_TALK_CLOSE_REASONS).toEqual(["person", "result", "slot", "target-changed", "cut"]);
    expect(POINT_TALK_CLOSE_REASONS.map(pointTalkPresenceClose))
      .toEqual(["person", "finished", "yielded", "invalidated", "preempted"]);
    // Only a modal or hidden page cuts; every other way fades.
    for (const reason of POINT_TALK_CLOSE_REASONS) {
      const close = pointTalkPresenceClose(reason);
      if (close === "preempted") {
        expect(reason).toBe("cut");
        continue;
      }
      expect(POINT_TALK_PRESENCE_POLICY.exitMs[close]).toBeGreaterThan(0);
    }
  });

  it("names an undeclared release by the phase the field ended in", () => {
    expect(pointTalkReleaseReason("stale")).toBe("target-changed");
    expect(pointTalkReleaseReason("success")).toBe("result");
    for (const phase of ["eligible", "ready", "pending", "error", "idle"] as const) {
      expect(pointTalkReleaseReason(phase)).toBe("cut");
    }
  });

  it("closes the field only through the host's one closer, always with a literal reason", () => {
    const host = parse(HOST);
    const hides = calls(host, (callee) => callee === "setPointTalkPresented")
      .filter((call) => call.arguments[0]?.getText(host) !== "true");
    expect(hides.map(enclosingDeclaration)).toEqual(["closePointTalk"]);

    const reasons = new Set<string>(POINT_TALK_CLOSE_REASONS);
    const closeCalls = [
      ...calls(host, (callee) => callee === "closePointTalk").map((call) => literalReason(host, call)),
      ...calls(parse(TURN), (callee) => callee === "onClose").map((call) => literalReason(parse(TURN), call)),
    ];
    expect(closeCalls.length).toBeGreaterThan(5);
    for (const reason of closeCalls) {
      for (const part of (reason ?? "<none>").split("|")) expect(reasons).toContain(part);
    }
  });

  it("lets only the closer declare how the field leaves", () => {
    const host = parse(HOST);
    const intents = calls(host, (callee) => callee.endsWith("ExitHandoff.intend"));
    expect(intents.map(enclosingDeclaration)).toEqual(["closePointTalk"]);
    const preemptions = calls(host, (callee) => callee.endsWith("ExitHandoff.preempt"));
    // The closer's cut, and the document switch, which replaces the paper.
    expect(preemptions).toHaveLength(2);
    expect(preemptions.map(enclosingDeclaration)).toContain("closePointTalk");
    const documentSwitch = preemptions.find((call) => enclosingDeclaration(call) !== "closePointTalk");
    let effect: ts.Node | undefined = documentSwitch?.parent;
    while (effect !== undefined && !(ts.isCallExpression(effect) &&
      effect.expression.getText(host) === "useLayoutEffect")) effect = effect.parent;
    expect(effect !== undefined && ts.isCallExpression(effect) &&
      effect.expression.getText(host) === "useLayoutEffect" &&
      effect.arguments[1]?.getText(host).includes("props.documentEpoch")).toBe(true);

    for (const name of [TURN, COMPOSER]) {
      const file = parse(name);
      expect(calls(file, (callee) => callee.endsWith(".intend") || callee.endsWith(".preempt")))
        .toHaveLength(0);
    }
    // The composer's release always names its fallback from the ended phase.
    const composer = parse(COMPOSER);
    const releases = calls(composer, (callee) => callee.endsWith("exitHandoff.release"));
    expect(releases).toHaveLength(1);
    expect(releases[0]!.arguments[2]?.getText(composer))
      .toBe("pointTalkPresenceClose(pointTalkReleaseReason(endedIn))");
  });

  it("never lets geometry close the field", () => {
    const composer = readFileSync(fileURLToPath(new URL(`./${COMPOSER}`, import.meta.url)), "utf8");
    expect(composer).not.toMatch(/onPlacementLost/u);
    expect(composer).not.toMatch(/setPlacement\(null\)/u);
  });
});
