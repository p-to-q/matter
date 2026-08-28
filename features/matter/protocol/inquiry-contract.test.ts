import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import { INQUIRY_CONTEXT_SCOPES, isInquiryContextScope } from "../config/inquiry";
import {
  MAX_INQUIRY_CONTEXT_CODE_POINTS as MATERIAL_CONTEXT_CODE_POINTS,
  MAX_INQUIRY_CONTEXT_NODES,
  MAX_INQUIRY_NODE_CODE_POINTS,
  type InquiryContextScope as MaterialInquiryContextScope,
} from "../material/inquiry-context";
import {
  MAX_INQUIRY_CONTEXT_CODE_POINTS,
  MAX_INQUIRY_LINEAGE_NODES,
  MAX_INQUIRY_NODE_TEXT_CODE_POINTS,
  MAX_INQUIRY_QUESTION_CODE_POINTS,
  inquiryReceipt,
  parseInquiryAnswer,
  parseInquiryRequest,
  type InquiryContextPayload,
  type InquiryContextScope,
} from "./inquiry-contract";

/**
 * The question is the one value in this envelope the prompt grants standing to.
 * Everything else here is reference, so this file is deliberately about the
 * question's own character and length discipline rather than the whole shape.
 */
function body(question: unknown): unknown {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "inq_1",
    question,
    locale: "zh-CN",
    context: {
      treeId: "tree_1",
      revision: 1,
      scope: "tree",
      lineage: [{ nodeId: "n1", depth: 0, text: "\u6750\u6599", truncated: false }],
      thoughtCount: 1,
      clipped: false,
    },
  };
}

const QUESTION = "\u8fd9\u4e24\u6bb5\u77db\u76fe\u5417\uff1f";

describe("inquiry question admission", () => {
  it("accepts a question written over several lines", () => {
    // Shift+Enter is browser-owned in the composer, so a multi-line question is
    // a person using the surface as offered, not an attempt at anything.
    const parsed = parseInquiryRequest(body(`${QUESTION}\n${QUESTION}`));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.request.question).toContain("\n");
  });

  it.each([
    ["a tab", "\t"],
    ["a carriage return", "\r\n"],
  ])("keeps %s, which a person can actually type", (_name, whitespace) => {
    expect(parseInquiryRequest(body(`${QUESTION}${whitespace}${QUESTION}`)).ok).toBe(true);
  });

  it("refuses an empty, blank, or oversize question", () => {
    expect(parseInquiryRequest(body("")).ok).toBe(false);
    expect(parseInquiryRequest(body("   ")).ok).toBe(false);
    const over = "\u95ee".repeat(MAX_INQUIRY_QUESTION_CODE_POINTS + 1);
    expect(parseInquiryRequest(body(over)).ok).toBe(false);
    const exact = "\u95ee".repeat(MAX_INQUIRY_QUESTION_CODE_POINTS);
    expect(parseInquiryRequest(body(exact)).ok).toBe(true);
  });

  it("counts the bound in code points rather than UTF-16 units", () => {
    // An emoji is two units and one code point; measuring units would refuse a
    // question well inside the stated bound.
    const emoji = "\u{1F389}".repeat(MAX_INQUIRY_QUESTION_CODE_POINTS);
    expect(parseInquiryRequest(body(emoji)).ok).toBe(true);
  });

  it("refuses a non-string question without throwing", () => {
    for (const question of [null, undefined, 42, {}, [QUESTION]]) {
      expect(parseInquiryRequest(body(question)).ok).toBe(false);
    }
  });
});

/**
 * The wire names differ from the neutral config's; the values must not. Nothing
 * below compares an export to a literal, so restating one of these numbers in
 * either module fails here rather than surviving until a person watches a
 * context the projection built and kept get refused as an invalid request.
 */
describe("inquiry bounds have one owner", () => {
  it("takes each context bound from the shared inquiry config", () => {
    expect(MAX_INQUIRY_NODE_TEXT_CODE_POINTS).toBe(MAX_INQUIRY_NODE_CODE_POINTS);
    expect(MAX_INQUIRY_LINEAGE_NODES).toBe(MAX_INQUIRY_CONTEXT_NODES);
    expect(MAX_INQUIRY_CONTEXT_CODE_POINTS).toBe(MATERIAL_CONTEXT_CODE_POINTS);
  });

  it("admits the widest context the projection can hand it", () => {
    const widestNode = [lineageNode(0, "\u95ee".repeat(MAX_INQUIRY_NODE_CODE_POINTS))];
    expect(parseInquiryRequest(contextBody(widestNode)).ok).toBe(true);

    const mostNodes = Array.from(
      { length: MAX_INQUIRY_CONTEXT_NODES },
      (_unused, index) => lineageNode(index, "\u95ee"),
    );
    expect(parseInquiryRequest(contextBody(mostNodes)).ok).toBe(true);

    // The projection clips a whole tree to this weight and stops; whatever
    // survives that clip has to pass the route it was clipped for.
    const wholeBudget: unknown[] = [];
    for (let spent = 0; spent < MATERIAL_CONTEXT_CODE_POINTS;) {
      const size = Math.min(MATERIAL_CONTEXT_CODE_POINTS - spent, MAX_INQUIRY_NODE_CODE_POINTS);
      wholeBudget.push(lineageNode(wholeBudget.length, "\u95ee".repeat(size)));
      spent += size;
    }
    expect(parseInquiryRequest(contextBody(wholeBudget)).ok).toBe(true);
  });

  it("shares the live projection and wire scope vocabulary", () => {
    expect(SCOPE_UNION_HAS_ONE_OWNER).toBe(true);
    for (const scope of INQUIRY_CONTEXT_SCOPES) expect(isInquiryContextScope(scope)).toBe(true);
    for (const other of ["lineage", "working-tree", "", null, 1]) {
      expect(isInquiryContextScope(other)).toBe(false);
    }
  });
});

describe("inquiry answer admission", () => {
  it.each([
    "回答\u0000隐藏",
    "回答\u061C隐藏",
    "回答\u200E隐藏",
    "回答\u200F隐藏",
    "回答\u202E隐藏",
    "回答\uD800隐藏",
    "# 标题\n回答",
    "- 第一项\n- 第二项",
    "> 引用",
    "---\n正文",
    "标题\n===\n正文",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
    "<h1>标题</h1>",
    '<a href="https://example.com">继续阅读</a>',
    "<https://example.com>",
    "<mailto:person@example.com>",
  ])("refuses answer text that cannot become quiet visible prose: %s", (text) => {
    expect(parseInquiryAnswer(answerBody(text), "inq_1", ANSWER_CONTEXT)).toBeNull();
  });

  it.each([
    "__init__ 是对象初始化方法。",
    "foo__bar 是材料中的原词。",
    "这里的 ** 只是两个星号。",
    "材料中的地址是 https://example.com。",
  ])("keeps literal material vocabulary: %s", (text) => {
    expect(parseInquiryAnswer(answerBody(text), "inq_1", ANSWER_CONTEXT))
      .toMatchObject({ status: "answered", text });
  });
});

/**
 * The claim this makes is the type annotation, not the assertion: the wire
 * scope and the projection scope are one declaration, and giving either its own
 * copy back resolves this to `false` and stops the file compiling.
 */
type Exactly<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
const SCOPE_UNION_HAS_ONE_OWNER: Exactly<InquiryContextScope, MaterialInquiryContextScope> = true;

function lineageNode(index: number, text: string): unknown {
  return { nodeId: `n${index}`, depth: index, text, truncated: false };
}

function contextBody(lineage: readonly unknown[]): unknown {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "inq_1",
    question: QUESTION,
    locale: "zh-CN",
    context: {
      treeId: "tree_1",
      revision: 1,
      scope: "tree",
      lineage,
      thoughtCount: lineage.length,
      clipped: false,
    },
  };
}

const ANSWER_CONTEXT: InquiryContextPayload = Object.freeze({
  treeId: "tree_1",
  revision: 1,
  scope: "tree",
  lineage: Object.freeze([
    Object.freeze({ nodeId: "n1", depth: 0, text: "材料", truncated: false }),
  ]),
  thoughtCount: 1,
  clipped: false,
});

function answerBody(text: string): unknown {
  return {
    protocolVersion: PROTOCOL_VERSION,
    basis: { requestId: "inq_1", treeId: "tree_1", revision: 1, scope: "tree" },
    status: "answered",
    text,
    receipt: inquiryReceipt(ANSWER_CONTEXT),
  };
}
