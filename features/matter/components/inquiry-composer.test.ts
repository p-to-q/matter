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

  it("clears a closed inquiry rather than retaining a transient exchange", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "旧问题" });
    state = reduceInquiry(state, { type: "ask" });
    expect(reduceInquiry(state, { type: "close" })).toEqual(createInquiryState());
  });
});
