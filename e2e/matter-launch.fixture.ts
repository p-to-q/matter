export type LaunchPointTalkFixture = Readonly<{
  locale: "zh-CN";
  passage: string;
  direction: string;
  text: string;
}>;

/** One private, synthetic contract owns the filmed prompt and visible result. */
export const LAUNCH_POINT_TALK_FIXTURE: LaunchPointTalkFixture = Object.freeze({
  locale: "zh-CN",
  passage: "过去之所以动人，也许因为它让今天暂时看见另一种安排。",
  direction: "说得更轻一些。",
  text: "也许，过去之所以动人，是因为它让今天暂时看见另一种安排。",
});
