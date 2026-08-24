import { MATTER_LOCALE, type MatterLocale } from "../config/locales";

export const SEEDED_PASSAGE_KEYS = Object.freeze([
  "root",
  "imaginedLives",
  "imaginedTime",
  "imaginedRelations",
  "presentDistance",
  "presentFailure",
  "presentOpening",
  "bodilyMemory",
  "bodilyGesture",
  "bodilyReturn",
] as const);

export type SeededPassageKey = (typeof SEEDED_PASSAGE_KEYS)[number];
export type SeededBranchTextResolver = (
  locale: MatterLocale,
  parentKey: SeededPassageKey | null,
) => readonly string[];

export const SEEDED_INITIAL_NODES = Object.freeze({
  root: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。",
  imaginedLives: "被允许想象的其他生活",
  imaginedTime: "也许怀念的是一种不必立刻证明效率的时间，它还没有被切成可以交付的单位。",
  imaginedRelations: "也许那里的人与人之间还有一些不必被计算的往来，慢一点也不会立刻失去位置。",
  presentDistance: "过去为什么在今天显得遥远",
  presentFailure: "它未必真的存在过；正因为不完整，才更容易被今天的缺口照亮。",
  presentOpening: "怀念不是回去的路线，更像一个还没有被封死的入口，让别的安排暂时可以被看见。",
  bodilyMemory: "身体怎样保存这种怀念",
  bodilyGesture: "有些记忆先以步速、停顿和说话时的犹豫回来，语言只是在后面追上它们。",
  bodilyReturn: "所以这段话不急着把过去说清楚，只想留住那一点仍能让身体调整方向的感觉。",
} satisfies Readonly<Record<SeededPassageKey, string>>);

const BRANCH_FLOORS = Object.freeze({
  [MATTER_LOCALE.simplifiedChinese]: [
    "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
  ],
  [MATTER_LOCALE.traditionalChinese]: [
    "也許我們懷念的不是過去本身，而是今天仍為另一種生活留下的餘地。",
  ],
  [MATTER_LOCALE.japanese]: [
    "私たちが懐かしんでいるのは過去そのものではなく、別の暮らしのために今も残されている余白なのかもしれない。",
  ],
  [MATTER_LOCALE.german]: [
    "Vielleicht vermissen wir nicht die Vergangenheit selbst, sondern den Raum, den die Gegenwart einem anderen Leben noch lässt.",
  ],
  [MATTER_LOCALE.english]: [
    "Perhaps what we miss is not the past itself, but the room the present still leaves for another life.",
  ],
} as const satisfies Readonly<Record<MatterLocale, readonly [string]>>);

/** Initial material is one simplified-Chinese seed; other seed copy is lazy. */
export function seededInitialNodeText(key: SeededPassageKey): string {
  return SEEDED_INITIAL_NODES[key];
}

/** Branch keeps one synchronous, locale-correct sentence before lazy copy arrives. */
export function seededFallbackBranchTexts(locale: MatterLocale): readonly string[] {
  return BRANCH_FLOORS[locale];
}
