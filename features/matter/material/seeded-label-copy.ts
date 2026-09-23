import { MATTER_LOCALE, type MatterLocale } from "../config/locales";
import type { SeededPassageKey } from "./seeded-material-core";

/** Small navigation copy may load with the lazy index without pulling seed passages into it. */
const LABELS = Object.freeze({
  [MATTER_LOCALE.simplifiedChinese]: Object.freeze({
    root: "允许我们想象的其他生活",
    imaginedLives: "被允许想象的其他生活",
    imaginedTime: "不必立刻证明效率的时间",
    imaginedRelations: "不必被计算的人际往来",
    presentDistance: "过去为什么在今天显得遥远",
    presentFailure: "被今天的缺口照亮",
    presentOpening: "还没有被封死的入口",
    bodilyMemory: "身体怎样保存这种怀念",
    bodilyGesture: "步速、停顿与说话时的犹豫",
    bodilyReturn: "让身体调整方向的感觉",
  }),
  [MATTER_LOCALE.traditionalChinese]: Object.freeze({
    root: "仍讓我們想像的其他生活",
    imaginedLives: "那些仍被允許想像的生活",
    imaginedTime: "不必立即證明效率的時間",
    imaginedRelations: "不必被計算的人際往來",
    presentDistance: "過去為何在今天顯得遙遠",
    presentFailure: "被今天的缺口照亮",
    presentOpening: "尚未被封死的入口",
    bodilyMemory: "身體如何保存這份懷念",
    bodilyGesture: "步速、停頓與說話時的猶豫",
    bodilyReturn: "讓身體調整方向的感覺",
  }),
  [MATTER_LOCALE.japanese]: Object.freeze({
    root: "別の暮らしを思い描く余地",
    imaginedLives: "想像を許された別の暮らし",
    imaginedTime: "効率をすぐ証明しない時間",
    imaginedRelations: "数えなくてよい人との行き来",
    presentDistance: "過去が今から遠く見える理由",
    presentFailure: "今の隙間に照らされる過去",
    presentOpening: "まだ塞がれていない入口",
    bodilyMemory: "身体がしまっておく懐かしさ",
    bodilyGesture: "歩く速さと間と言葉のためらい",
    bodilyReturn: "身体が向きを変えられる感覚",
  }),
  [MATTER_LOCALE.german]: Object.freeze({
    root: "Andere vorstellbare Leben",
    imaginedLives: "Andere Leben bleiben denkbar",
    imaginedTime: "Zeit ohne Effizienzdruck",
    imaginedRelations: "Unberechnete Begegnungen",
    presentDistance: "Warum die Vergangenheit fern ist",
    presentFailure: "Von heutigen Lücken beleuchtet",
    presentOpening: "Ein noch offener Eingang",
    bodilyMemory: "Wie der Körper Sehnsucht bewahrt",
    bodilyGesture: "Schritttempo, Pause und Zögern",
    bodilyReturn: "Die Richtung ändern können",
  }),
  [MATTER_LOCALE.english]: Object.freeze({
    root: "Other lives still imaginable",
    imaginedLives: "Other lives we may still imagine",
    imaginedTime: "Time without efficiency pressure",
    imaginedRelations: "Unmeasured human exchanges",
    presentDistance: "Why the past feels distant now",
    presentFailure: "Lit by today’s absences",
    presentOpening: "An entrance not yet sealed",
    bodilyMemory: "How the body holds longing",
    bodilyGesture: "Pace, pause, and hesitation",
    bodilyReturn: "A body able to change direction",
  }),
} satisfies Readonly<Record<MatterLocale, Readonly<Record<SeededPassageKey, string>>>>);

export function seededNodeLabels(locale: MatterLocale): Readonly<Record<SeededPassageKey, string>> {
  return LABELS[locale];
}

export function seededNodeLabel(locale: MatterLocale, key: SeededPassageKey): string {
  return LABELS[locale][key];
}
