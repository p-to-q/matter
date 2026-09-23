export type LaunchPointTalkFixture = Readonly<{
  locale: "zh-CN";
  passage: string;
  direction: string;
  text: string;
}>;

export const LAUNCH_MATERIAL_COPY = Object.freeze({
  voice: "记忆也会替尚未发生的生活保留位置。",
  thirdBranch: "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
  nestedBranch: "怀念不是返回原处，而是确认还有没有继续想象的入口。",
});

/** One private, synthetic contract owns the filmed prompt and visible result. */
export const LAUNCH_POINT_TALK_FIXTURE: LaunchPointTalkFixture = Object.freeze({
  locale: "zh-CN",
  passage: "过去动人的也许不是完整，而是它让另一种生活显得可能。",
  direction: "把它改成更明确的判断。",
  text: "也许过去动人的，不是完整，而是它曾让另一种生活显得可能。",
});
