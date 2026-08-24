import { MATTER_LOCALE, type MatterLocale } from "../config/locales";
import {
  SEEDED_INITIAL_NODES,
  type SeededPassageKey,
} from "./seeded-material-core";

export { SEEDED_PASSAGE_KEYS } from "./seeded-material-core";
export type { SeededPassageKey } from "./seeded-material-core";

export const SEEDED_MATERIAL_COPY_CHUNK_SENTINEL = "matter-seeded-material-copy";

type StoredSeededMaterialCopy = Readonly<{
  nodes: Readonly<Record<SeededPassageKey, string>>;
}>;

type SeededMaterialCopy = Readonly<{
  title: string;
  nodes: Readonly<Record<SeededPassageKey, string>>;
}>;

/** Complete localized seed copy, loaded only with the atomic relocalizer. */
const COPY = {
  [MATTER_LOCALE.simplifiedChinese]: {
    nodes: SEEDED_INITIAL_NODES,
  },
  [MATTER_LOCALE.traditionalChinese]: {
    nodes: {
      root: "我們懷念的，也許並不是一個真實存在過的過去，而是那個過去在今天仍讓我們得以想像的其他生活。",
      imaginedLives: "那些仍被允許想像的生活",
      imaginedTime: "也許我們懷念的是一種不必立刻證明效率的時間，它還沒有被切割成可以交付的單位。",
      imaginedRelations: "也許那裡的人與人之間，還有一些不必被計算的往來；慢一點，也不會立刻失去自己的位置。",
      presentDistance: "過去為何在今天顯得遙遠",
      presentFailure: "它未必真的存在過；正因為不完整，才更容易被今天的缺口照亮。",
      presentOpening: "懷念不是回去的路線，更像一個尚未被封死的入口，讓別的安排暫時得以被看見。",
      bodilyMemory: "身體如何保存這份懷念",
      bodilyGesture: "有些記憶先以步速、停頓，以及說話時的猶豫回來；語言只是在後面追上它們。",
      bodilyReturn: "所以這段話不急著把過去說清楚，只想留住那一點仍能讓身體調整方向的感覺。",
    },
  },
  [MATTER_LOCALE.japanese]: {
    nodes: {
      root: "私たちが懐かしんでいるのは、ほんとうに存在した過去ではなく、その過去が今もなお思い描かせてくれる、別の暮らしなのかもしれない。",
      imaginedLives: "まだ想像することを許されている、別の暮らし",
      imaginedTime: "私たちが懐かしんでいるのは、すぐに効率を証明しなくてもよかった時間なのかもしれない。その時間はまだ、納品できる単位には切り分けられていなかった。",
      imaginedRelations: "そこでは、人と人とのあいだに、まだ数えなくてよい行き来があったのかもしれない。少しくらい遅くても、すぐに居場所を失うことはなかった。",
      presentDistance: "なぜ過去は、今から見ると遠く感じられるのか",
      presentFailure: "ほんとうには存在しなかったのかもしれない。けれど不完全だからこそ、今に空いた隙間の光を受けて浮かび上がる。",
      presentOpening: "懐かしさは帰るための道ではない。まだ塞がれていない入口のように、別のあり方をしばらく見えるものにしてくれる。",
      bodilyMemory: "身体は、この懐かしさをどうしまっておくのか",
      bodilyGesture: "ある記憶は、歩く速さや間、話すときのためらいとして先に戻ってくる。言葉は少し遅れて、それらに追いつく。",
      bodilyReturn: "だからこの文章は、過去を急いで明らかにしようとはしない。ただ、身体がなお向きを変えられる、そのわずかな感覚を留めておきたい。",
    },
  },
  [MATTER_LOCALE.german]: {
    nodes: {
      root: "Vielleicht vermissen wir keine Vergangenheit, die es wirklich gegeben hat, sondern die anderen Leben, die uns diese Vergangenheit noch heute vorstellbar macht.",
      imaginedLives: "Andere Leben, die wir uns noch vorstellen dürfen",
      imaginedTime: "Vielleicht vermissen wir eine Zeit, die ihre Effizienz nicht sofort beweisen musste und noch nicht in lieferbare Einheiten zerlegt war.",
      imaginedRelations: "Vielleicht gab es dort zwischen Menschen noch Begegnungen, die nicht berechnet werden mussten; wer langsamer war, verlor nicht gleich seinen Platz.",
      presentDistance: "Warum die Vergangenheit heute so fern erscheint",
      presentFailure: "Vielleicht hat es sie nie ganz gegeben; gerade ihre Unvollständigkeit lässt sie in den Lücken der Gegenwart aufleuchten.",
      presentOpening: "Sehnsucht ist kein Weg zurück. Sie gleicht eher einem noch nicht verschlossenen Eingang, der andere Ordnungen für einen Moment sichtbar werden lässt.",
      bodilyMemory: "Wie der Körper diese Sehnsucht bewahrt",
      bodilyGesture: "Manche Erinnerungen kehren zuerst als Schritttempo, Pause und Zögern beim Sprechen zurück; die Sprache holt sie erst später ein.",
      bodilyReturn: "Deshalb drängen diese Worte nicht darauf, die Vergangenheit zu erklären. Sie wollen nur jene kleine Empfindung bewahren, die dem Körper noch erlaubt, die Richtung zu ändern.",
    },
  },
  [MATTER_LOCALE.english]: {
    nodes: {
      root: "Perhaps what we miss is not a past that ever truly existed, but the other lives that past still lets us imagine from here, today.",
      imaginedLives: "Other lives we are still allowed to imagine",
      imaginedTime: "Perhaps what we miss is a kind of time that did not have to prove its efficiency at once, before it was divided into units fit for delivery.",
      imaginedRelations: "Perhaps people there still shared exchanges that did not need to be measured, and moving more slowly did not immediately cost them their place.",
      presentDistance: "Why the past feels distant from the present",
      presentFailure: "It may never have fully existed; its incompleteness is precisely what lets today’s absences cast it into relief.",
      presentOpening: "Longing is not a route back. It is more like an entrance not yet sealed, through which other arrangements can remain visible for a while.",
      bodilyMemory: "How the body keeps this kind of longing",
      bodilyGesture: "Some memories return first as pace, pause, and hesitation in speech; language only catches up to them later.",
      bodilyReturn: "So these words do not hurry to make the past clear. They only try to preserve the small sensation that still lets the body change direction.",
    },
  },
} as const satisfies Readonly<Record<MatterLocale, StoredSeededMaterialCopy>>;

export function seededMaterialCopy(locale: MatterLocale): SeededMaterialCopy {
  const copy = COPY[locale];
  return Object.freeze({
    title: copy.nodes.imaginedLives,
    nodes: copy.nodes,
  });
}

export function seededNodeText(locale: MatterLocale, key: SeededPassageKey): string {
  return COPY[locale].nodes[key];
}

export function isCanonicalSeededNodeText(key: SeededPassageKey, text: string): boolean {
  return Object.values(COPY).some((copy) => copy.nodes[key] === text);
}

export function isCanonicalSeededTitle(title: string): boolean {
  return Object.values(COPY).some((copy) => copy.nodes.imaginedLives === title);
}
