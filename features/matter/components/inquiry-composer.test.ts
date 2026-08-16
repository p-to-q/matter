import { describe, expect, it } from "vitest";
import {
  createInquiryState,
  inquiryText,
  canSubmitInquiry,
  pendingAnswerId,
  reduceInquiry,
} from "./inquiry-composer";

describe("inquiry composer", () => {
  it("keeps typed and dictated language before asking", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "过去" });
    state = reduceInquiry(state, { type: "listen" });
    state = reduceInquiry(state, { type: "hear", value: "允许什么" });
    expect(inquiryText(state)).toBe("过去允许什么");
    state = reduceInquiry(state, { type: "listened" });
    expect(state).toMatchObject({ phase: "idle", draft: "过去允许什么", interim: "" });
  });

  it("keeps the final local transcript while recorded audio is processing", () => {
    let state = reduceInquiry(createInquiryState(), { type: "listen" });
    state = reduceInquiry(state, { type: "transcribe" });
    expect(state.phase).toBe("transcribing");
    state = reduceInquiry(state, { type: "hear", value: "这是端侧转写。" });
    state = reduceInquiry(state, { type: "listened" });
    expect(state).toMatchObject({
      phase: "idle",
      draft: "这是端侧转写。",
      interim: "",
    });
  });

  it("moves one question into a bounded pending exchange and resolves it", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "这是什么？" });
    const answerId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });
    expect(state.turns).toHaveLength(2);
    expect(state.draft).toBe("");
    state = reduceInquiry(state, {
      type: "answer",
      id: answerId,
      outcome: { status: "unavailable", reason: "NO_PROVIDER" },
    });
    expect(state.turns.at(-1)).toMatchObject({ role: "matter", outcome: { reason: "NO_PROVIDER" } });
  });

  it("only enables a settled non-blank question with no pending answer", () => {
    const typed = reduceInquiry(createInquiryState(), { type: "type", value: "这是什么？" });
    expect(canSubmitInquiry(typed)).toBe(true);
    const pending = reduceInquiry(typed, { type: "ask" });
    expect(canSubmitInquiry(pending)).toBe(false);
    expect(canSubmitInquiry(reduceInquiry(typed, { type: "listen" }))).toBe(false);
    expect(canSubmitInquiry(reduceInquiry(createInquiryState(), { type: "type", value: "   " }))).toBe(false);
  });

  it("drops an exchange when its material context changes", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "旧材料" });
    state = reduceInquiry(state, { type: "ask" });
    expect(state.turns).not.toHaveLength(0);
    expect(reduceInquiry(state, { type: "scope-changed" })).toEqual(createInquiryState());
  });

  it("keeps the record and settles the pending turn when the material is edited", () => {
    // The record exists so a person can look back over earlier questions.
    // Material changing underneath it must not empty it — only leave no turn
    // animating forever, which would also block every later question.
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "第一个问题" });
    state = reduceInquiry(state, { type: "ask" });
    state = reduceInquiry(state, {
      type: "answer",
      id: state.turns.at(-1)!.id,
      outcome: { status: "answered", text: "第一个回答" },
    });
    state = reduceInquiry(state, { type: "type", value: "第二个问题" });
    state = reduceInquiry(state, { type: "ask" });

    const settled = reduceInquiry(state, {
      type: "settle-pending",
      outcome: { status: "unavailable", reason: "UNREACHABLE" },
    });

    expect(settled.turns).toHaveLength(4);
    expect(settled.turns[0]).toMatchObject({ role: "person", text: "第一个问题" });
    expect(settled.turns[1]).toMatchObject({ outcome: { status: "answered", text: "第一个回答" } });
    expect(settled.turns[3]).toMatchObject({ outcome: { status: "unavailable", reason: "UNREACHABLE" } });
    expect(canSubmitInquiry(reduceInquiry(settled, { type: "type", value: "第三个问题" }))).toBe(true);
  });

  it("clears a closed inquiry rather than retaining a transient exchange", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "旧问题" });
    state = reduceInquiry(state, { type: "ask" });
    expect(reduceInquiry(state, { type: "close" })).toEqual(createInquiryState());
  });
});
