import type { MatterLocale } from "../config/locales";

// Provisional in every locale except en-US: pending native-speaker review.
export type PictureControlCopy = Readonly<{
  /** The visible label of the control; the accessible name must contain it. */
  control: string;
  controlName: string;
  /** The arm step's cost and privacy statement. */
  armStatement: string;
  /** The same statement, led by the warning that an earlier attempt may have been billed. */
  armStatementBilled: string;
  draw: string;
  back: string;
  drawing: string;
  stopWaiting: string;
  keep: string;
  discard: string;
  notDrawn: string;
  notDrawnUsed: string;
  anotherInFlight: string;
  tryAgain: string;
  keepNotSaved: string;
  keepRefused: string;
  /** Announced once when the wait begins. */
  announceDrawing: string;
  /** Announced once when Keep succeeded. */
  announceKept: string;
}>;

// A complete table: a missing locale or key is a type error, never a fallback
// to another language.
const PICTURE_CONTROL_COPY: Readonly<Record<MatterLocale, PictureControlCopy>> = Object.freeze({
  "en-US": Object.freeze({
    control: "Draw",
    controlName: "Draw a picture from this passage",
    armStatement:
      "Draws one picture. Your passage goes to a text model; only a short line goes to an image service. Takes up to a minute. Leaving loses it.",
    armStatementBilled:
      "The last attempt may already have been used. Draws one picture. Your passage goes to a text model; only a short line goes to an image service. Takes up to a minute. Leaving loses it.",
    draw: "Draw",
    back: "Back",
    drawing: "Drawing…",
    stopWaiting: "Stop waiting",
    keep: "Keep",
    discard: "Discard",
    notDrawn: "Not drawn.",
    notDrawnUsed: "Not drawn. That attempt may already have been used.",
    anotherInFlight: "Another picture is being drawn.",
    tryAgain: "Try again",
    keepNotSaved: "Couldn't save on this device. Kept for this session — try Keep again.",
    keepRefused: "This picture can't be kept here.",
    announceDrawing: "Drawing",
    announceKept: "Kept. Undo is available.",
  }),
  "zh-CN": Object.freeze({
    control: "生图",
    controlName: "根据这段文字生图",
    armStatement:
      "生成一张图。这段文字会交给文字模型，只有一句简短描述会发给图像服务。最多需要一分钟，离开就会丢失。",
    armStatementBilled:
      "上一次的尝试可能已经被使用。生成一张图。这段文字会交给文字模型，只有一句简短描述会发给图像服务。最多需要一分钟，离开就会丢失。",
    draw: "开始生图",
    back: "返回",
    drawing: "正在生图…",
    stopWaiting: "不再等待",
    keep: "保留",
    discard: "丢弃",
    notDrawn: "没有生成图片。",
    notDrawnUsed: "没有生成图片。那次尝试可能已被使用。",
    anotherInFlight: "另一张图片正在生成。",
    tryAgain: "再试一次",
    keepNotSaved: "无法保存到此设备。已暂存于本次会话，请再试一次保留。",
    keepRefused: "这张图片无法在此保留。",
    announceDrawing: "正在生图",
    announceKept: "已保留，可撤销。",
  }),
  "zh-TW": Object.freeze({
    control: "生圖",
    controlName: "根據這段文字生圖",
    armStatement:
      "生成一張圖。這段文字會交給文字模型，只有一句簡短描述會傳給圖像服務。最多需要一分鐘，離開就會遺失。",
    armStatementBilled:
      "上一次的嘗試可能已被使用。生成一張圖。這段文字會交給文字模型，只有一句簡短描述會傳給圖像服務。最多需要一分鐘，離開就會遺失。",
    draw: "開始生圖",
    back: "返回",
    drawing: "正在生圖…",
    stopWaiting: "不再等待",
    keep: "保留",
    discard: "捨棄",
    notDrawn: "沒有生成圖片。",
    notDrawnUsed: "沒有生成圖片。那次嘗試可能已被使用。",
    anotherInFlight: "另一張圖片正在生成。",
    tryAgain: "再試一次",
    keepNotSaved: "無法儲存到此裝置。已暫存於本次工作階段，請再試一次保留。",
    keepRefused: "這張圖片無法在此保留。",
    announceDrawing: "正在生圖",
    announceKept: "已保留，可復原。",
  }),
  "ja-JP": Object.freeze({
    control: "描く",
    controlName: "この段落から絵を描く",
    armStatement:
      "絵を1枚描きます。段落の文章はテキストモデルに送られ、画像サービスには短い一文だけが送られます。最長で1分ほどかかります。離れると失われます。",
    armStatementBilled:
      "前回の試行はすでに使われた可能性があります。絵を1枚描きます。段落の文章はテキストモデルに送られ、画像サービスには短い一文だけが送られます。最長で1分ほどかかります。離れると失われます。",
    draw: "描く",
    back: "戻る",
    drawing: "描いています…",
    stopWaiting: "待つのをやめる",
    keep: "残す",
    discard: "捨てる",
    notDrawn: "描けませんでした。",
    notDrawnUsed: "描けませんでした。その試行はすでに使われた可能性があります。",
    anotherInFlight: "別の絵を描いている最中です。",
    tryAgain: "もう一度",
    keepNotSaved: "この端末に保存できませんでした。このセッションでは残しています。もう一度「残す」を試してください。",
    keepRefused: "この絵はここでは残せません。",
    announceDrawing: "描いています",
    announceKept: "残しました。元に戻せます。",
  }),
  "de-DE": Object.freeze({
    control: "Zeichnen",
    controlName: "Zeichnen: ein Bild zu diesem Absatz",
    armStatement:
      "Zeichnet ein Bild. Dein Absatz geht an ein Textmodell; nur eine kurze Zeile geht an einen Bilddienst. Dauert bis zu einer Minute. Wenn du gehst, geht es verloren.",
    armStatementBilled:
      "Der letzte Versuch wurde möglicherweise schon verbraucht. Zeichnet ein Bild. Dein Absatz geht an ein Textmodell; nur eine kurze Zeile geht an einen Bilddienst. Dauert bis zu einer Minute. Wenn du gehst, geht es verloren.",
    draw: "Zeichnen",
    back: "Zurück",
    drawing: "Wird gezeichnet …",
    stopWaiting: "Nicht mehr warten",
    keep: "Behalten",
    discard: "Verwerfen",
    notDrawn: "Nicht gezeichnet.",
    notDrawnUsed: "Nicht gezeichnet. Der Versuch wurde möglicherweise schon verbraucht.",
    anotherInFlight: "Ein anderes Bild wird gerade gezeichnet.",
    tryAgain: "Erneut versuchen",
    keepNotSaved: "Auf diesem Gerät nicht speicherbar. Für diese Sitzung behalten – versuche Behalten erneut.",
    keepRefused: "Dieses Bild kann hier nicht behalten werden.",
    announceDrawing: "Wird gezeichnet",
    announceKept: "Behalten. Rückgängig ist möglich.",
  }),
});

export function pictureControlCopy(locale: MatterLocale): PictureControlCopy {
  return PICTURE_CONTROL_COPY[locale];
}
