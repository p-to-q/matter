import type { TextSwapScenarioInput } from "./text-swap-harness";

export type FrozenTextSwap = Readonly<{
  locale: TextSwapScenarioInput["locale"];
  passage: string;
  direction: string;
  text: string;
}>;

/** One named contract owns the filmed transcript, passage, and visible result. */
export const LAUNCH_POINT_TALK_FIXTURE: FrozenTextSwap = Object.freeze({
  locale: "zh-CN",
  passage: "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
  direction: "说得更轻一些。",
  text: "也许，我们怀念的不是过去本身，而是今天仍为另一种生活留着一点余地。",
});

/** A closed synthetic map. A miss is unavailable, never generic prose. */
export const FROZEN_TEXT_SWAP_FIXTURES: readonly FrozenTextSwap[] = Object.freeze([
  Object.freeze({
    locale: "zh-CN",
    passage: "房间慢慢安静下来",
    direction: "换一种更清楚但保留安静感的说法",
    text: "屋里渐渐恢复了安静",
  }),
  Object.freeze({
    locale: "zh-CN",
    passage: "我们怀念的也许不是一个真实存在过的过去",
    direction: "换一种更凝练的说法",
    text: "我们也许怀念的，并不是一个曾经真实存在的过去",
  }),
  LAUNCH_POINT_TALK_FIXTURE,
]);
