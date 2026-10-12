import type { MatterLocale } from "../config/locales";

// Provisional in every locale except en-US: pending native-speaker review.
export type PictureControlCopy = Readonly<{
  /** The visible label of the control; the accessible name must contain it. */
  control: string;
  controlName: string;
  /** The arm step's cost and privacy statement. */
  armStatement: string;
  /** Its own line above the statement once an earlier attempt may have been billed. */
  armWarningBilled: string;
  draw: string;
  back: string;
  drawing: string;
  /** A quiet line under the drawing step: how long the wait may be. */
  drawingExpectation: string;
  stopWaiting: string;
  keep: string;
  discard: string;
  notDrawn: string;
  notDrawnUsed: string;
  anotherInFlight: string;
  /** Why the control cannot start, and what a refused Draw says: the document's picture bounds. */
  documentFull: string;
  tryAgain: string;
  keepNotSaved: string;
  keepRefused: string;
  /** Announced once when the wait begins. */
  announceDrawing: string;
  /** Announced once when the picture has arrived and waits for Keep or Discard. */
  announceArrived: string;
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
    armWarningBilled: "The last attempt may already have been used.",
    draw: "Draw",
    back: "Back",
    drawing: "Drawing…",
    drawingExpectation: "Up to a minute.",
    stopWaiting: "Stop waiting",
    keep: "Keep",
    discard: "Discard",
    notDrawn: "Not drawn.",
    notDrawnUsed: "Not drawn. That attempt may already have been used.",
    anotherInFlight: "Another picture is being drawn.",
    documentFull: "This document already holds as many pictures as it can.",
    tryAgain: "Try again",
    keepNotSaved: "Couldn’t save on this device. Kept for this session — try Keep again.",
    keepRefused: "This picture can’t be kept here.",
    announceDrawing: "Drawing",
    announceArrived: "Picture ready.",
    announceKept: "Kept. Undo is available.",
  }),
  "zh-CN": Object.freeze({
    control: "绘图",
    controlName: "根据这段文字绘图",
    armStatement:
      "绘制一张图片。这段文字会交给文字模型，只有一句简短描述会发给图像服务。最多需要一分钟，离开就会丢失。",
    armWarningBilled: "上一次可能已产生用量。",
    draw: "开始绘图",
    back: "返回",
    drawing: "正在绘图…",
    drawingExpectation: "最多需要一分钟。",
    stopWaiting: "不再等待",
    keep: "保留",
    discard: "丢弃",
    notDrawn: "没有绘制图片。",
    notDrawnUsed: "没有绘制图片。那次尝试可能已被使用。",
    anotherInFlight: "另一张图片正在绘制。",
    documentFull: "这份文档已经放不下更多图片了。",
    tryAgain: "再试一次",
    keepNotSaved: "无法保存到此设备。已暂存于本次会话，请再试一次保留。",
    keepRefused: "这张图片无法在此保留。",
    announceDrawing: "正在绘图",
    announceArrived: "图片已绘制完成。",
    announceKept: "已保留，可撤销。",
  }),
  "zh-TW": Object.freeze({
    control: "繪圖",
    controlName: "根據這段文字繪圖",
    armStatement:
      "繪製一張圖片。這段文字會交給文字模型，只有一句簡短描述會傳給圖像服務。最多需要一分鐘，離開就會遺失。",
    armWarningBilled: "上一次可能已產生用量。",
    draw: "開始繪圖",
    back: "返回",
    drawing: "正在繪圖…",
    drawingExpectation: "最多需要一分鐘。",
    stopWaiting: "不再等待",
    keep: "保留",
    discard: "捨棄",
    notDrawn: "沒有繪製圖片。",
    notDrawnUsed: "沒有繪製圖片。那次嘗試可能已被使用。",
    anotherInFlight: "另一張圖片正在繪製。",
    documentFull: "這份文件已經放不下更多圖片了。",
    tryAgain: "再試一次",
    keepNotSaved: "無法儲存到此裝置。已暫存於本次工作階段，請再試一次保留。",
    keepRefused: "這張圖片無法在此保留。",
    announceDrawing: "正在繪圖",
    announceArrived: "圖片已繪製完成。",
    announceKept: "已保留，可復原。",
  }),
  "ja-JP": Object.freeze({
    control: "描く",
    controlName: "この段落から絵を描く",
    armStatement:
      "絵を1枚描きます。段落の文章はテキストモデルに送られ、画像サービスには短い一文だけが送られます。最長で1分ほどかかります。離れると失われます。",
    armWarningBilled: "前回の試行はすでに使われた可能性があります。",
    draw: "描く",
    back: "戻る",
    drawing: "描いています…",
    drawingExpectation: "最長で1分ほどかかります。",
    stopWaiting: "待つのをやめる",
    keep: "残す",
    discard: "捨てる",
    notDrawn: "描けませんでした。",
    notDrawnUsed: "描けませんでした。その試行はすでに使われた可能性があります。",
    anotherInFlight: "別の絵を描いている最中です。",
    documentFull: "この文書には、これ以上絵を入れられません。",
    tryAgain: "もう一度",
    keepNotSaved: "この端末に保存できませんでした。このセッションでは残しています。もう一度「残す」を試してください。",
    keepRefused: "この絵はここでは残せません。",
    announceDrawing: "描いています",
    announceArrived: "絵ができました。",
    announceKept: "残しました。元に戻せます。",
  }),
  "de-DE": Object.freeze({
    control: "Zeichnen",
    controlName: "Bild zu diesem Absatz zeichnen",
    armStatement:
      "Zeichnet ein Bild. Ihr Absatz geht an ein Textmodell; nur eine kurze Zeile geht an einen Bilddienst. Dauert bis zu einer Minute. Beim Verlassen geht es verloren.",
    armWarningBilled: "Der letzte Versuch wurde möglicherweise schon verbraucht.",
    draw: "Zeichnen",
    back: "Zurück",
    drawing: "Wird gezeichnet …",
    drawingExpectation: "Dauert bis zu einer Minute.",
    stopWaiting: "Nicht mehr warten",
    keep: "Behalten",
    discard: "Verwerfen",
    notDrawn: "Nicht gezeichnet.",
    notDrawnUsed: "Nicht gezeichnet. Der Versuch wurde möglicherweise schon verbraucht.",
    anotherInFlight: "Ein anderes Bild wird gerade gezeichnet.",
    documentFull: "Dieses Dokument enthält bereits so viele Bilder, wie es aufnehmen kann.",
    tryAgain: "Erneut versuchen",
    keepNotSaved: "Auf diesem Gerät nicht speicherbar. Für diese Sitzung behalten – versuchen Sie „Behalten“ erneut.",
    keepRefused: "Dieses Bild kann hier nicht behalten werden.",
    announceDrawing: "Wird gezeichnet",
    announceArrived: "Bild fertig.",
    announceKept: "Behalten. Rückgängig ist möglich.",
  }),
});

export function pictureControlCopy(locale: MatterLocale): PictureControlCopy {
  return PICTURE_CONTROL_COPY[locale];
}
