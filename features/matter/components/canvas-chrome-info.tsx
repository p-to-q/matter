import type { ReactNode } from "react";
import type { CanvasLanguage } from "./canvas-preferences";

export type CanvasChromeInfoId = "about" | "pricing" | "privacy" | "terms";
export type CanvasChromeInquiryInfo = Readonly<{
  title: string;
  body: readonly ReactNode[];
}>;
export type CanvasChromeInfo = Readonly<Record<CanvasChromeInfoId, Readonly<{
  title: string;
  body: readonly ReactNode[];
}>> & { inquiry: CanvasChromeInquiryInfo }>;
function PToQAttribution({ before, after }: Readonly<{ before: string; after: string }>) {
  return (
    <>
      {before}
      <a href="https://www.ptoq.io/">[p → q]</a>
      {after}
    </>
  );
}

const ENGLISH_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({
    title: "About Matter",
    body: Object.freeze([
      "Matter is an invitation to stay with a thought before it becomes an answer.",
      "Matter is an interface for unfinished thought. Voice brings language in, gesture touches exact material and sets how much it may change, and a rooted structure keeps each thought's lineage.",
      "It is a way of thinking with AI in material, not through a chat. Unfinished thoughts deserve room to remain uncertain, to be touched, and to keep growing.",
      "AI gives language intelligence. Matter gives thought a body.",
      "This is an early preview. Live voice input, transcript repair, and Ask Matter are available. Public material transformation remains gated while its interaction language is being proven.",
      <PToQAttribution after="." before="Matter is a project by " key="attribution" />,
    ]),
  }),
  inquiry: Object.freeze({
    title: "Ask Matter",
    body: Object.freeze([
      "Ask one short question about the material included on this canvas. Asking never changes it.",
      "Use Lasso to circle exact language, stretch to set how much should change, Branch to grow a related thought, and Undo to reverse the last committed change.",
    ]),
  }),
  pricing: Object.freeze({
    title: "Pricing",
    body: Object.freeze([
      "Matter is in pre-release. There is no paid plan or checkout in this build.",
    ]),
  }),
  privacy: Object.freeze({
    title: "Privacy",
    body: Object.freeze([
      "Material is kept in this browser unless you export it or invoke a model-powered change.",
      "A published privacy policy is not available for this pre-release. Each model call receives only its bounded task material. An inquiry sends only bounded lassoed language or the bounded material included on this canvas; held-aside material is not sent.",
      "Voice normally uses browser-managed recognition, whose service handling depends on the browser. If Matter falls back to on-device recognition, audio stays on this device; first use downloads an approximately 152 MB fixed model from Hugging Face, may take time, and can be cancelled. That figure covers the model graphs; tokenizer and WASM runtime assets may download separately.",
    ]),
  }),
  terms: Object.freeze({
    title: "Terms",
    body: Object.freeze([
      "Matter is pre-release software. Published terms of service are not available yet.",
      "Keep an export of material you cannot replace while the product is still being proven.",
    ]),
  }),
});

const CHINESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({
    title: "关于 Matter",
    body: Object.freeze([
      "Matter 邀请你在一个想法变成答案之前，先和它待在一起。",
      "Matter 是一个让未完成想法获得形体的界面。声音把语言带进来；手势触碰确切的材料，决定它可以改变多少；根状结构让每个想法保留自己的脉络。",
      "这是一种在材料中与 AI 一起思考的方式，而不是在对话框里等待答案。尚未成形的想法需要保留犹豫、被触碰，也继续生长的空间。",
      "AI 赋予语言智能，Matter 让思想拥有身体。",
      "当前是早期预览。实时语音输入、语音整理和询问 Matter 已可使用。公开的材料生成变换仍受门禁限制，它的交互语言还在验证中。",
      <PToQAttribution after=" 发起的项目。" before="Matter 是由 " key="attribution" />,
    ]),
  }),
  inquiry: Object.freeze({
    title: "询问 Matter",
    body: Object.freeze([
      "就画面里被纳入的材料问一句短问题。询问不会改变它。",
      "用套索圈定确切语言，拖动边缘决定改变多少；用延展生成相关想法，用撤销退回上一次已提交的改变。",
    ]),
  }),
  pricing: Object.freeze({
    title: "定价",
    body: Object.freeze([
      "Matter 仍在内测。此版本尚无付费方案或结账功能。",
    ]),
  }),
  privacy: Object.freeze({
    title: "隐私",
    body: Object.freeze([
      "材料保存在当前浏览器中，除非你主动导出，或发起一次由模型完成的改变。",
      "内测阶段尚未发布正式隐私政策。每次模型调用只接收该任务所需的有限材料；询问只发送套索圈定且受限长度的语言，或画面里被纳入的有限材料，暂不纳入的材料不会发送。",
      "语音通常使用浏览器管理的识别服务，其服务处理方式取决于浏览器。若 Matter 回退到本机识别，音频会留在这台设备上；首次使用会从 Hugging Face 下载约 152 MB 的固定模型，可能需要一些时间，且可以取消。该数字只涵盖模型图；分词器和 WASM 运行时资源可能另行下载。",
    ]),
  }),
  terms: Object.freeze({
    title: "服务条款",
    body: Object.freeze([
      "Matter 仍是内测软件，尚未发布正式服务条款。",
      "产品仍在验证阶段，请为无法替代的材料保留一份导出副本。",
    ]),
  }),
});

const TRADITIONAL_CHINESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "關於 Matter", body: Object.freeze([
    "Matter 邀請你在一個想法變成答案之前，先和它待在一起。",
    "Matter 是讓未完成想法獲得形體的介面。聲音帶入語言，手勢觸碰確切材料並決定改變多少，根狀結構保留每個想法的脈絡。",
    "這是在材料中與 AI 一起思考，而不是在對話框裡等待答案。未完成的想法需要保留猶豫、被觸碰並繼續生長的空間。",
    "AI 賦予語言智能，Matter 讓思想擁有身體。",
    "這是早期預覽。實時語音輸入、語音整理和詢問 Matter 已可使用。公開的材料生成變換仍受門禁限制，它的互動語言仍在驗證中。",
    <PToQAttribution after=" 發起的項目。" before="Matter 是由 " key="attribution" />,
  ]) }),
  inquiry: Object.freeze({ title: "詢問 Matter", body: Object.freeze([
    "就畫面裡被納入的材料問一句短問題。詢問不會改變它。",
    "用套索圈定語言，拖動邊緣決定改變多少；用延展生成相關想法，用復原退回上一次已提交的改變。",
  ]) }),
  pricing: Object.freeze({ title: "定價", body: Object.freeze(["Matter 仍在預覽階段，此版本沒有付費方案或結帳功能。"])}),
  privacy: Object.freeze({ title: "隱私", body: Object.freeze(["材料保存在目前瀏覽器中，除非你主動匯出或發起模型改變。", "正式隱私政策尚未發布。每次模型呼叫只接收該任務所需的有限材料；詢問只傳送套索圈定且受限長度的語言，或畫面裡被納入的有限材料，暫不納入的材料不會傳送。", "語音通常使用由瀏覽器管理的辨識服務，其服務處理方式取決於瀏覽器。若 Matter 改用本機辨識，音訊會留在這台裝置；首次使用會從 Hugging Face 下載約 152 MB 的固定模型，可能需要一些時間，而且可以取消。這個數字只涵蓋模型圖；分詞器和 WASM 執行期資源可能另行下載。"])}),
  terms: Object.freeze({ title: "服務條款", body: Object.freeze(["Matter 仍是預覽軟體，正式服務條款尚未發布。", "產品仍在驗證階段，請為無法替代的材料保留匯出副本。"])}),
});

const JAPANESE_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "Matter について", body: Object.freeze([
    "Matter は、考えが答えになる前に、その考えと留まるための環境です。",
    "Matter は未完成の考えに形を与えるためのインターフェースです。声が言葉を運び、ジェスチャーが触れる場所と変化の量を決め、根のある構造が系譜を保ちます。",
    "これはチャットで答えを待つのではなく、素材の中で AI と考える方法です。未完成な考えにも、迷いを残し、触れ、育てる余白があります。",
    "AI は言葉に知性を与え、Matter は思考に身体を与えます。",
    "初期プレビューです。リアルタイム音声入力、音声の整形、Matter への質問は利用できます。公開環境での素材生成変換は引き続き制限され、そのインタラクション言語を検証しています。",
    <PToQAttribution after=" のプロジェクトです。" before="Matter は " key="attribution" />,
  ]) }),
  inquiry: Object.freeze({ title: "Matter に尋ねる", body: Object.freeze([
    "この画面に含まれている素材について短く尋ねます。尋ねても素材は変わりません。",
    "なげなわで言葉を囲み、伸縮で変化の量を決め、展開で関連する考えを育て、取り消すで直前の変更を戻します。",
  ]) }),
  pricing: Object.freeze({ title: "料金", body: Object.freeze(["Matter はプレビュー中です。このビルドに有料プランや決済はありません。"])}),
  privacy: Object.freeze({ title: "プライバシー", body: Object.freeze(["素材は、書き出しまたはモデルによる変更を行わない限り、このブラウザに保存されます。", "正式なプライバシーポリシーはまだありません。各モデル呼び出しには、その処理に必要な範囲の素材だけが渡されます。問い合わせでは、上限内の Lasso で選んだ言葉、またはこの画面に含まれている範囲内の素材だけを送り、除外した素材は送りません。", "音声入力は通常、ブラウザ管理の認識機能を使うため、サービス側の扱いはブラウザに依存します。Matter が端末内認識へ切り替わる場合、音声はこの端末に残ります。初回は Hugging Face から約 152 MB の固定モデルを取得するため時間がかかることがありますが、キャンセルできます。この数値はモデルグラフのみで、トークナイザーと WASM ランタイムの資産は別途取得されることがあります。"])}),
  terms: Object.freeze({ title: "利用規約", body: Object.freeze(["Matter はプレビューソフトウェアで、正式な利用規約はまだありません。", "置き換えられない素材は、検証中のあいだ書き出しを保管してください。"])}),
});

const GERMAN_INFO: CanvasChromeInfo = Object.freeze({
  about: Object.freeze({ title: "Über Matter", body: Object.freeze([
    "Matter lädt dazu ein, bei einem Gedanken zu bleiben, bevor er zu einer Antwort wird.",
    "Matter ist eine Schnittstelle für unfertige Gedanken. Die Stimme bringt Sprache herein, Gesten berühren genaues Material und bestimmen das Maß der Veränderung, eine verwurzelte Struktur bewahrt die Herkunft jedes Gedankens.",
    "Es ist eine Art, mit KI im Material zu denken, nicht in einem Chat auf Antworten zu warten. Unfertige Gedanken dürfen unsicher bleiben, berührt werden und weiterwachsen.",
    "KI gibt Sprache Intelligenz. Matter gibt Gedanken einen Körper.",
    "Dies ist eine frühe Vorschau. Live-Spracheingabe, Transkriptreparatur und Matter fragen sind verfügbar. Die öffentliche generative Materialtransformation bleibt gesperrt, während ihre Interaktionssprache erprobt wird.",
    <PToQAttribution after="." before="Matter ist ein Projekt von " key="attribution" />,
  ]) }),
  inquiry: Object.freeze({ title: "Matter fragen", body: Object.freeze([
    "Stelle eine kurze Frage zu dem Material, das auf dieser Fläche einbezogen ist. Eine Frage verändert es nicht.",
    "Mit Lasso markierst du Sprache, mit Stretch bestimmst du das Ausmaß, Verzweigen erzeugt einen verwandten Gedanken und Rückgängig macht die letzte Änderung rückgängig.",
  ]) }),
  pricing: Object.freeze({ title: "Preise", body: Object.freeze(["Matter ist in der Vorschau. Dieser Build hat keinen kostenpflichtigen Plan und keine Kasse."])}),
  privacy: Object.freeze({ title: "Datenschutz", body: Object.freeze(["Material bleibt in diesem Browser, außer du exportierst es oder startest eine modellgestützte Änderung.", "Eine veröffentlichte Datenschutzerklärung gibt es noch nicht. Jeder Modellaufruf erhält nur das für seine begrenzte Aufgabe nötige Material. Eine Frage sendet begrenztes, mit Lasso markiertes Sprachmaterial oder das begrenzte, auf dieser Fläche einbezogene Material; zurückgestelltes Material wird nicht gesendet.", "Spracheingabe nutzt normalerweise die browserverwaltete Erkennung; wie deren Dienst mit Daten umgeht, hängt vom Browser ab. Falls Matter auf Erkennung auf dem Gerät zurückfällt, bleibt das Audio auf diesem Gerät. Beim ersten Mal wird ein festes Modell von etwa 152 MB von Hugging Face geladen; das kann dauern und lässt sich abbrechen. Diese Angabe umfasst die Modellgraphen; Tokenizer- und WASM-Laufzeitressourcen können getrennt geladen werden."])}),
  terms: Object.freeze({ title: "Nutzungsbedingungen", body: Object.freeze(["Matter ist Vorschau-Software; veröffentlichte Nutzungsbedingungen gibt es noch nicht.", "Bewahre für unersetzliches Material einen Export auf, solange das Produkt erprobt wird."])}),
});

export const CANVAS_CHROME_INFO: Readonly<Record<CanvasLanguage, CanvasChromeInfo>> = Object.freeze({
  "en-US": ENGLISH_INFO,
  "zh-CN": CHINESE_INFO,
  "zh-TW": TRADITIONAL_CHINESE_INFO,
  "ja-JP": JAPANESE_INFO,
  "de-DE": GERMAN_INFO,
});


export function readCanvasChromeInfo() { return CANVAS_CHROME_INFO; }
Object.defineProperty(readCanvasChromeInfo, "matterCapability", { value: "matter-capability:chrome-info" });

