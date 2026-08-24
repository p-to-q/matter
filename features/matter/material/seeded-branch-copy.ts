import { MATTER_LOCALE, type MatterLocale } from "../config/locales";
import {
  seededFallbackBranchTexts,
  type SeededBranchTextResolver,
  type SeededPassageKey,
} from "./seeded-material-core";

type BranchCopy = Readonly<Partial<Record<SeededPassageKey, readonly string[]>>>;

/**
 * Parent-specific preview prose is an interaction asset, not first-paint copy.
 * MatterApp loads this module after mount and retains the synchronous closed
 * floor if the chunk is not yet available or cannot be loaded.
 */
const BY_PARENT = {
  [MATTER_LOCALE.simplifiedChinese]: {
    root: [
      "也许我们怀念的不是过去本身，而是今天还留给另一种生活的余地。",
      "过去之所以动人，也许因为它让今天暂时看见另一种安排。",
      "怀念不是返回原处，而是确认还有没有继续想象的入口。",
    ],
    imaginedLives: [
      "被允许想象的生活，不必立刻证明自己有效。",
      "另一种生活先以可能的样子存在，再慢慢找到它的形状。",
    ],
    imaginedTime: [
      "那种时间的价值，也许正在于它没有急着把一切变成结果。",
      "如果时间不只用来交付，迟疑也可以成为一种方向。",
    ],
    presentDistance: [
      "今天的距离也许来自我们已经习惯用现在的尺度解释过去。",
      "过去显得遥远，并不代表它曾经完整地存在过。",
    ],
    presentFailure: [
      "不完整并不是缺陷，它让今天仍有重新想象的缝隙。",
      "正因为无法被完全证明，这个入口才没有被封死。",
    ],
    presentOpening: [
      "入口不必把人带回过去，它只需要让别的安排暂时可见。",
      "只要还可以被看见，怀念就不只是回去的路线。",
    ],
    bodilyMemory: [
      "身体记住的不是年代，而是它曾经可以朝向别处的节奏。",
      "有些怀念先以步速和停顿回来，语言只是在后面追上它。",
    ],
    bodilyGesture: [
      "停顿留下的方向，比一句解释更早让身体知道该往哪里去。",
      "当语言追上动作时，记忆已经先替它保留了余地。",
    ],
    bodilyReturn: [
      "所以这段话不急着把过去说清楚，只先留住调整方向的感觉。",
      "身体保留下来的那一点余地，足够让下一句话继续生长。",
    ],
  },
  [MATTER_LOCALE.traditionalChinese]: {
    root: [
      "也許我們懷念的不是過去本身，而是今天仍為另一種生活留下的餘地。",
      "過去之所以動人，也許是因為它讓今天暫時看見另一種安排。",
      "懷念不是回到原處，而是確認是否還有繼續想像的入口。",
    ],
    imaginedLives: [
      "被允許想像的生活，不必立刻證明自己有用。",
      "另一種生活先以可能的樣子存在，再慢慢找到自己的形狀。",
    ],
    imaginedTime: [
      "那種時間的價值，也許正在於它沒有急著把一切變成結果。",
      "如果時間不只用來交付，遲疑也可以成為一種方向。",
    ],
    presentDistance: [
      "今天的距離，也許來自我們早已習慣用現在的尺度解釋過去。",
      "過去顯得遙遠，並不代表它曾經完整地存在過。",
    ],
    presentFailure: [
      "不完整不是缺陷，它讓今天仍有重新想像的縫隙。",
      "正因為無法被完全證明，這個入口才尚未被封死。",
    ],
    presentOpening: [
      "入口不必把人帶回過去，它只需要讓別的安排暫時可見。",
      "只要還能被看見，懷念就不只是回去的路線。",
    ],
    bodilyMemory: [
      "身體記住的不是年代，而是它曾經能夠朝向別處的節奏。",
      "有些懷念先以步速和停頓回來，語言只是在後面追上它。",
    ],
    bodilyGesture: [
      "停頓留下的方向，比一句解釋更早讓身體知道該往哪裡去。",
      "當語言追上動作時，記憶早已替它保留了餘地。",
    ],
    bodilyReturn: [
      "所以這段話不急著把過去說清楚，只先留住調整方向的感覺。",
      "身體留下的那一點餘地，足以讓下一句話繼續生長。",
    ],
  },
  [MATTER_LOCALE.japanese]: {
    root: [
      "私たちが懐かしんでいるのは過去そのものではなく、別の暮らしのために今も残されている余白なのかもしれない。",
      "過去が心を動かすのは、それが今という時間に、別のあり方をほんの一瞬見せてくれるからかもしれない。",
      "懐かしさは元の場所へ戻ることではなく、想像を続ける入口がまだあるかどうかを確かめることだ。",
    ],
    imaginedLives: [
      "想像することを許された暮らしは、すぐに役に立つと証明しなくてもいい。",
      "別の暮らしは、まず可能性の姿で存在し、そこからゆっくり自分のかたちを見つけていく。",
    ],
    imaginedTime: [
      "その時間の価値は、あらゆるものを急いで結果に変えなかったことにあるのかもしれない。",
      "時間が納品のためだけにあるのでなければ、ためらいもまた一つの方向になりうる。",
    ],
    presentDistance: [
      "今感じる隔たりは、私たちが現在の尺度で過去を説明することに慣れてしまったからかもしれない。",
      "過去が遠く見えるからといって、それがかつて完全なかたちで存在したとは限らない。",
    ],
    presentFailure: [
      "不完全さは欠陥ではない。そこに、今も想像し直すための隙間が残る。",
      "完全には証明できないからこそ、この入口はまだ塞がれていない。",
    ],
    presentOpening: [
      "入口は私たちを過去へ連れ戻さなくていい。ただ、別のあり方をしばらく見えるものにすればいい。",
      "まだ見ることができるかぎり、懐かしさはただ帰るための道ではない。",
    ],
    bodilyMemory: [
      "身体が覚えているのは年代ではなく、かつて別の方角へ向かうことのできた、そのリズムだ。",
      "ある懐かしさは歩く速さや間として先に戻ってくる。言葉はあとからそれに追いつくだけだ。",
    ],
    bodilyGesture: [
      "間が残した方向を、身体は説明よりも先に知っている。",
      "言葉が動作に追いつくころには、記憶がすでにその余白を守っている。",
    ],
    bodilyReturn: [
      "だからこの文章は、過去を急いで明らかにしようとはしない。ただ、向きを変える感覚だけを先に留めておく。",
      "身体に残されたそのわずかな余白があれば、次の言葉はまだ育っていける。",
    ],
  },
  [MATTER_LOCALE.german]: {
    root: [
      "Vielleicht vermissen wir nicht die Vergangenheit selbst, sondern den Raum, den die Gegenwart einem anderen Leben noch lässt.",
      "Vielleicht berührt uns die Vergangenheit, weil sie die Gegenwart für einen Moment eine andere Ordnung erkennen lässt.",
      "Sehnsucht heißt nicht, an den Ausgangspunkt zurückzukehren, sondern zu prüfen, ob noch ein Eingang zum Weiterdenken offen ist.",
    ],
    imaginedLives: [
      "Ein Leben, das wir uns vorstellen dürfen, muss seine Brauchbarkeit nicht sofort beweisen.",
      "Ein anderes Leben existiert zuerst als Möglichkeit und findet erst nach und nach seine Form.",
    ],
    imaginedTime: [
      "Der Wert dieser Zeit liegt vielleicht gerade darin, dass sie nicht alles sofort in ein Ergebnis verwandeln wollte.",
      "Wenn Zeit nicht nur der Ablieferung dient, kann auch das Zögern eine Richtung sein.",
    ],
    presentDistance: [
      "Vielleicht rührt die heutige Distanz daher, dass wir die Vergangenheit mit den Maßstäben der Gegenwart erklären.",
      "Dass die Vergangenheit fern wirkt, heißt nicht, dass sie je vollständig existiert hat.",
    ],
    presentFailure: [
      "Unvollständigkeit ist kein Mangel; sie lässt der Gegenwart einen Spalt, durch den sie neu imaginieren kann.",
      "Gerade weil es sich nicht vollständig beweisen lässt, ist dieser Eingang noch nicht verschlossen.",
    ],
    presentOpening: [
      "Ein Eingang muss uns nicht in die Vergangenheit zurückführen; er muss nur andere Ordnungen für einen Augenblick sichtbar machen.",
      "Solange sie noch sichtbar werden können, ist Sehnsucht mehr als ein Weg zurück.",
    ],
    bodilyMemory: [
      "Der Körper erinnert sich nicht an Jahreszahlen, sondern an den Rhythmus, in dem er sich einmal anderswohin wenden konnte.",
      "Manche Sehnsucht kehrt zuerst als Schritttempo und Pause zurück; die Sprache holt sie erst später ein.",
    ],
    bodilyGesture: [
      "Die Richtung, die eine Pause zurücklässt, teilt sich dem Körper früher mit als jede Erklärung.",
      "Wenn die Sprache die Bewegung einholt, hat die Erinnerung ihr den Freiraum schon bewahrt.",
    ],
    bodilyReturn: [
      "Deshalb drängen diese Worte nicht darauf, die Vergangenheit zu erklären; sie halten zunächst nur das Gefühl fest, die Richtung ändern zu können.",
      "Der kleine Freiraum, den der Körper bewahrt, genügt, damit der nächste Satz weiterwachsen kann.",
    ],
  },
  [MATTER_LOCALE.english]: {
    root: [
      "Perhaps what we miss is not the past itself, but the room the present still leaves for another life.",
      "Perhaps the past moves us because it lets the present glimpse another arrangement, if only for a moment.",
      "Longing is not a return to where we began, but a way of asking whether an entrance to further imagining still remains.",
    ],
    imaginedLives: [
      "A life we are allowed to imagine need not prove its usefulness at once.",
      "Another life first exists as a possibility, then slowly finds its form.",
    ],
    imaginedTime: [
      "Perhaps the value of that kind of time lies precisely in its refusal to hurry everything into a result.",
      "If time is not only for delivery, hesitation too can become a direction.",
    ],
    presentDistance: [
      "Perhaps today’s distance comes from our habit of explaining the past by the measures of the present.",
      "The past seeming far away does not mean it ever existed whole.",
    ],
    presentFailure: [
      "Incompleteness is not a flaw; it leaves the present a seam through which to imagine again.",
      "It is precisely because it cannot be fully proven that this entrance has not been sealed.",
    ],
    presentOpening: [
      "An entrance need not take us back to the past. It need only make other arrangements visible for a while.",
      "As long as it can still be seen, longing is more than a route back.",
    ],
    bodilyMemory: [
      "The body remembers not the dates, but the rhythm in which it was once able to turn elsewhere.",
      "Some longings return first as pace and pause; language only catches up later.",
    ],
    bodilyGesture: [
      "The direction left by a pause tells the body where to go before any explanation can.",
      "By the time language catches up with movement, memory has already kept some room for it.",
    ],
    bodilyReturn: [
      "So these words do not hurry to make the past clear; they first preserve the feeling of being able to change direction.",
      "The small measure of room the body has kept is enough for the next sentence to keep growing.",
    ],
  },
} as const satisfies Readonly<Record<MatterLocale, BranchCopy>>;

export const seededBranchTexts: SeededBranchTextResolver = (locale, parentKey) => {
  const byParent: BranchCopy = BY_PARENT[locale];
  return (parentKey === null ? undefined : byParent[parentKey])
    ?? seededFallbackBranchTexts(locale);
};
