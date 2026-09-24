import { FILM_COPY } from "./copy.mjs";

export type LaunchPointTalkFixture = Readonly<{
  locale: "zh-CN";
  passage: string;
  direction: string;
  text: string;
}>;

export const LAUNCH_MATERIAL_COPY = Object.freeze({
  voice: FILM_COPY.material.voice,
  thirdBranch: FILM_COPY.material.thirdBranch,
  nestedBranch: FILM_COPY.material.nestedBranch,
});

/** One private, synthetic contract owns the filmed prompt and visible result. */
export const LAUNCH_POINT_TALK_FIXTURE: LaunchPointTalkFixture = Object.freeze({
  locale: FILM_COPY.locale,
  passage: FILM_COPY.pointTalk.passage,
  direction: FILM_COPY.pointTalk.direction,
  text: FILM_COPY.pointTalk.result,
});
