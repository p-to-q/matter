export type LaunchPointTalkFixture = Readonly<{
  locale: "zh-CN";
  passage: string;
  direction: string;
  text: string;
}>;

export const LAUNCH_MATERIAL_COPY = Object.freeze({
  voice: "记忆也会替尚未发生的生活保留位置。",
  thirdBranch: "过去之所以动人，也许因为它让今天暂时看见另一种安排。",
  nestedBranch: "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
});

/** One private, synthetic contract owns the filmed prompt and visible result. */
export const LAUNCH_POINT_TALK_FIXTURE: LaunchPointTalkFixture = Object.freeze({
  locale: "zh-CN",
  passage: "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
  direction: "把它改成更明确的判断。",
  text: "我们怀念的也许不是过去，而是今天仍为另一种生活保留的余地。",
});
