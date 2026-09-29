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

  it("withdraws a provider failure and restores the question without drawing an error turn", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "这是什么？" });
    const answerId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });
    state = reduceInquiry(state, {
      type: "withdraw",
      id: answerId,
      question: "这是什么？",
      reason: "BUSY",
    });
    expect(state.turns).toEqual([]);
    expect(state.draft).toBe("这是什么？");
    // The refusal is said once, quietly, in the status slot.
    expect(state.notice).toEqual({ kind: "answer", reason: "BUSY" });
    expect(canSubmitInquiry(state)).toBe(true);
    expect(reduceInquiry(state, { type: "type", value: "这是什么" }).notice).toBeNull();
  });

  it("withdraws an explicitly cancelled question without a notice", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "先不问了" });
    const answerId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });
    state = reduceInquiry(state, { type: "withdraw", id: answerId, question: "先不问了", reason: null });
    expect(state).toMatchObject({ draft: "先不问了", notice: null, turns: [] });
  });

  it("keeps a voice notice distinct from an answer notice", () => {
    let state = reduceInquiry(createInquiryState(), { type: "listen" });
    state = reduceInquiry(state, { type: "listen-failed", notice: "voice-denied" });
    expect(state.notice).toEqual({ kind: "voice", reason: "voice-denied" });
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

  it("clears settled exchanges and the draft when the bubble closes", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "旧问题" });
    const answerId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });
    state = reduceInquiry(state, { type: "answer", id: answerId, outcome: { status: "answered", text: "旧回答" } });
    state = reduceInquiry(state, { type: "type", value: "没问出口的话" });
    const closed = reduceInquiry(state, { type: "close" });
    expect(closed).toMatchObject({ draft: "", turns: [], notice: null, phase: "idle" });
  });

  it("keeps a submitted question in flight through close and reopen", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "第一个问题" });
    const firstAnswerId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });
    state = reduceInquiry(state, {
      type: "answer",
      id: firstAnswerId,
      outcome: { status: "answered", text: "第一个回答" },
    });
    state = reduceInquiry(state, { type: "type", value: "第二个问题" });
    const pendingId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });

    // Dismissing presentation is not cancellation after submit.
    const closed = reduceInquiry(state, { type: "close" });
    expect(closed.turns).toEqual([
      { id: pendingId - 1, role: "person", text: "第二个问题" },
      { id: pendingId, role: "matter", outcome: { status: "pending" } },
    ]);
    expect(canSubmitInquiry(reduceInquiry(closed, { type: "type", value: "第三个" }))).toBe(false);

    // A second close while still pending keeps it; its late answer lands.
    const answered = reduceInquiry(reduceInquiry(closed, { type: "close" }), {
      type: "answer",
      id: pendingId,
      outcome: { status: "answered", text: "第二个回答" },
    });
    expect(answered.turns.at(-1)).toMatchObject({ outcome: { status: "answered", text: "第二个回答" } });
    expect(pendingAnswerId(answered)).toBeGreaterThan(pendingId);

    // Seen settled, the next close lets it go.
    expect(reduceInquiry(answered, { type: "close" }).turns).toEqual([]);
  });

  it("returns a question refused while closed to the next opening", () => {
    let state = reduceInquiry(createInquiryState(), { type: "type", value: "关着的时候问的" });
    const answerId = pendingAnswerId(state);
    state = reduceInquiry(state, { type: "ask" });
    state = reduceInquiry(state, { type: "close" });
    state = reduceInquiry(state, {
      type: "withdraw",
      id: answerId,
      question: "关着的时候问的",
      reason: "TIMED_OUT",
    });
    expect(state).toMatchObject({
      draft: "关着的时候问的",
      turns: [],
      notice: { kind: "answer", reason: "TIMED_OUT" },
    });
  });
});
