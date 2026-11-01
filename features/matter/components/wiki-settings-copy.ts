import type { CanvasLanguage } from "./canvas-preferences";

export type WikiSettingsCopy = Readonly<{
  title: string;
  footerNote: string;
  filterLabel: string;
  add: string;
  export: string;
  search: string;
  all: string;
  automatic: string;
  manual: string;
  empty: string;
  noResults: (query: string) => string;
  word: string;
  editorHint: string;
  scope: string;
  scopeBoth: string;
  scopeSpoken: string;
  scopeWritten: string;
  addToDictionary: string;
  save: string;
  confirmWriting: string;
  cancel: string;
  edit: string;
  remove: string;
  disableAutomaticCollection: string;
  enableAutomaticCollection: string;
  disablePhoneticFitting: string;
  enablePhoneticFitting: string;
  removeQuestion: string;
  confirm: string;
  loadMore: string;
  loading: string;
  retry: string;
  unavailable: string;
  superseded: string;
  damaged: string;
  recover: string;
  recoverQuestion: string;
  saved: string;
  failed: string;
  stale: string;
  duplicate: string;
  bounded: string;
  invalid: string;
  exported: string;
  total: (count: number) => string;
  count: (visible: number, total: number) => string;
}>;

const ENGLISH: WikiSettingsCopy = Object.freeze({
  title: "WIKI",
  footerNote: "Words stay on this device and are never sent to a model. Only locally released, verified rules may change material.",
  filterLabel: "Word source",
  add: "Add word",
  export: "Export dictionary",
  search: "Search words",
  all: "All",
  automatic: "Automatically added",
  manual: "Manually added",
  empty: "No words yet. Use + to add a preferred spelling.",
  noResults: (query) => query.length > 0 ? `No result for “${query}”.` : "No words in this view.",
  word: "Word or name",
  editorHint: "Save one preferred spelling and where it may apply. Unverified fitting never changes material.",
  scope: "May apply to",
  scopeBoth: "All text",
  scopeSpoken: "Voice input",
  scopeWritten: "Generated text",
  addToDictionary: "Add to dictionary",
  save: "Save",
  confirmWriting: "Confirm",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Remove",
  disableAutomaticCollection: "Disable collection",
  enableAutomaticCollection: "Enable collection",
  disablePhoneticFitting: "Disable fitting",
  enablePhoneticFitting: "Enable fitting",
  removeQuestion: "Remove?",
  confirm: "Confirm",
  loadMore: "Load more",
  loading: "Loading local words…",
  retry: "Retry",
  unavailable: "Local words are temporarily unavailable.",
  superseded: "A newer Matter owns this local dictionary. Open it with that version.",
  damaged: "The saved Wiki is damaged.",
  recover: "Recover",
  recoverQuestion: "Replace the damaged data with the starter Wiki?",
  saved: "Saved locally.",
  failed: "Not saved. Retry after refreshing.",
  stale: "WIKI changed in another window. Review this word again.",
  duplicate: "This word already exists or conflicts with another entry.",
  bounded: "This dictionary has reached its local capacity.",
  invalid: "Enter a valid word or name.",
  exported: "Download started",
  total: (count) => count === 1 ? "1 word" : `${count} words`,
  count: (visible, total) => `${visible}/${total}`,
});

// No table spreads another: a spread would let a missing key silently fall
// back to a different language instead of failing the type check.
const SIMPLIFIED_CHINESE: WikiSettingsCopy = Object.freeze({
  title: "词典 WIKI",
  footerNote: "词典只保存在这台设备上，不会发送给模型。只有已验证并发布的本地规则可以改写材料。",
  filterLabel: "词条来源",
  add: "添加词",
  export: "导出词典",
  search: "搜索词语或名称",
  all: "全部",
  automatic: "自动添加",
  manual: "手动添加",
  empty: "还没有词。用右上角的 ＋ 添加一个标准写法。",
  noResults: (query) => query.length > 0
    ? `没有找到“${query}”。`
    : "还没有词。用右上角的 ＋ 添加一个标准写法。",
  word: "词语或名称",
  editorHint: "保存一个标准写法，并选择它可用于哪里。未通过验证的拟合不会改写材料。",
  scope: "可用于",
  scopeBoth: "所有文字",
  scopeSpoken: "语音输入",
  scopeWritten: "生成内容",
  addToDictionary: "加入词典",
  save: "保存",
  confirmWriting: "确认",
  cancel: "取消",
  edit: "修改",
  remove: "移出词典",
  disableAutomaticCollection: "关闭收词",
  enableAutomaticCollection: "开启收词",
  disablePhoneticFitting: "关闭近音",
  enablePhoneticFitting: "开启近音",
  removeQuestion: "从词典中移除这个词？",
  confirm: "确认",
  loadMore: "加载更多",
  loading: "正在读取本地词典…",
  retry: "重试",
  unavailable: "本地词典暂时不可用。",
  superseded: "本地词典已由较新版本的 Matter 保存，请使用该版本打开。",
  damaged: "保存的词典已损坏。",
  recover: "恢复",
  recoverQuestion: "用初始词典替换损坏的数据？",
  saved: "已保存在这台设备上。",
  failed: "没有保存。材料仍可正常使用，请稍后重试。",
  stale: "词典已在另一个窗口更新，请再确认一次。",
  duplicate: "这个词已在词典中，或与另一词条冲突。",
  bounded: "词典已达到本地容量上限。",
  invalid: "请输入一个有效的词语或名称。",
  exported: "下载已开始",
  total: (count) => `${count} 个词`,
  count: (visible, total) => `${visible}/${total}`,
});

const TRADITIONAL_CHINESE: WikiSettingsCopy = Object.freeze({
  title: "詞典 WIKI",
  footerNote: "詞典只儲存在這台裝置上，不會傳送給模型。只有已驗證並發佈的本機規則可以改寫材料。",
  filterLabel: "詞條來源",
  add: "新增詞",
  export: "匯出詞典",
  search: "搜尋詞典",
  all: "全部",
  automatic: "自動新增",
  manual: "手動新增",
  empty: "還沒有詞。用右上角的 ＋ 新增一個標準寫法。",
  noResults: (query) => query.length > 0
    ? `找不到「${query}」。`
    : "還沒有詞。用右上角的 ＋ 新增一個標準寫法。",
  word: "詞語或名稱",
  editorHint: "儲存一個標準寫法，並選擇它可用於哪裡。未通過驗證的擬合不會改寫材料。",
  scope: "可用於",
  scopeBoth: "所有文字",
  scopeSpoken: "語音輸入",
  scopeWritten: "生成內容",
  addToDictionary: "加入詞典",
  save: "儲存",
  confirmWriting: "確認",
  cancel: "取消",
  edit: "修改",
  remove: "移除",
  disableAutomaticCollection: "關閉收詞",
  enableAutomaticCollection: "開啟收詞",
  disablePhoneticFitting: "關閉近音",
  enablePhoneticFitting: "開啟近音",
  removeQuestion: "從詞典中移除這個詞？",
  confirm: "確認",
  loadMore: "載入更多",
  loading: "正在載入本機詞典…",
  retry: "重試",
  unavailable: "本機詞典暫時無法使用。",
  superseded: "本機詞典已由較新版本的 Matter 儲存，請使用該版本開啟。",
  damaged: "儲存的詞典已損壞。",
  recover: "復原",
  recoverQuestion: "用初始詞典取代損壞的資料？",
  saved: "已儲存在本機。",
  failed: "沒有儲存。材料仍可正常使用，請稍後重試。",
  stale: "詞典已在另一視窗更新，請重新確認這個詞。",
  duplicate: "這個詞已在詞典中，或與另一詞條衝突。",
  bounded: "本機詞典已達安全容量上限。",
  invalid: "請輸入一個有效的詞語或名稱。",
  exported: "下載已開始",
  total: (count) => `${count} 個詞`,
  count: (visible, total) => `${visible}/${total}`,
});

const JAPANESE: WikiSettingsCopy = Object.freeze({
  title: "辞書 WIKI",
  footerNote: "語はこのデバイスにのみ保存され、モデルには送信されません。検証・公開済みのローカルルールだけが素材を変更できます。",
  filterLabel: "追加元",
  add: "新しい語",
  export: "書き出す",
  search: "辞書を検索",
  all: "すべて",
  automatic: "自動追加",
  manual: "手動追加",
  empty: "まだ語はありません。＋ から正しい表記を追加できます。",
  noResults: (query) => query.length > 0
    ? `「${query}」は見つかりません。`
    : "まだ語はありません。右上の ＋ から正しい表記を追加できます。",
  word: "語句または名称",
  editorHint: "標準表記と適用先を保存します。未検証のフィッティングは素材を変更しません。",
  scope: "使用可能な入力元",
  scopeBoth: "すべての文字",
  scopeSpoken: "音声入力",
  scopeWritten: "生成テキスト",
  addToDictionary: "辞書に追加",
  save: "保存",
  confirmWriting: "確認",
  cancel: "キャンセル",
  edit: "編集",
  remove: "削除",
  disableAutomaticCollection: "自動収集をオフ",
  enableAutomaticCollection: "自動収集をオン",
  disablePhoneticFitting: "近似発音をオフ",
  enablePhoneticFitting: "近似発音をオン",
  removeQuestion: "削除しますか？",
  confirm: "確認",
  loadMore: "さらに読み込む",
  loading: "ローカル辞書を読み込み中…",
  retry: "再試行",
  unavailable: "ローカル辞書を一時的に利用できません。",
  superseded: "このローカル辞書は新しい Matter で保存されています。そのバージョンで開いてください。",
  damaged: "保存した辞書が破損しています。",
  recover: "復旧",
  recoverQuestion: "破損したデータを初期辞書に置き換えますか？",
  saved: "ローカルに保存しました。",
  failed: "保存できませんでした。更新して再試行してください。",
  stale: "辞書が別のウィンドウで更新されました。もう一度確認してください。",
  duplicate: "この語はすでに存在するか、別の語と競合しています。",
  bounded: "ローカル辞書は安全な容量上限に達しました。",
  invalid: "有効な語句または名称を入力してください。",
  exported: "書き出しを開始しました",
  total: (count) => `${count}語`,
  count: (visible, total) => `${visible}/${total}`,
});

const GERMAN: WikiSettingsCopy = Object.freeze({
  title: "WÖRTERBUCH WIKI",
  footerNote: "Wörter bleiben auf diesem Gerät und werden nie an ein Modell gesendet. Nur geprüfte, lokal veröffentlichte Regeln dürfen Material ändern.",
  filterLabel: "Herkunft der Wörter",
  add: "Neues Wort",
  export: "Exportieren",
  search: "Wörter suchen",
  all: "Alle",
  automatic: "Automatisch hinzugefügt",
  manual: "Manuell hinzugefügt",
  empty: "Noch keine Wörter. Mit + kann eine bevorzugte Schreibweise hinzugefügt werden.",
  noResults: (query) => query.length > 0
    ? `Kein Ergebnis für „${query}“.`
    : "Noch keine Wörter. Mit ＋ oben rechts kann eine bevorzugte Schreibweise hinzugefügt werden.",
  word: "Wort oder Name",
  editorHint: "Speichert eine bevorzugte Schreibweise und ihren Geltungsbereich. Ungeprüfte Anpassungen ändern kein Material.",
  scope: "Mögliche Quellen",
  scopeBoth: "Alle Texte",
  scopeSpoken: "Spracheingabe",
  scopeWritten: "Generierten Text",
  addToDictionary: "Zum Wörterbuch hinzufügen",
  save: "Speichern",
  confirmWriting: "Bestätigen",
  cancel: "Abbrechen",
  edit: "Bearbeiten",
  remove: "Entfernen",
  disableAutomaticCollection: "Wortsammlung ausschalten",
  enableAutomaticCollection: "Wortsammlung einschalten",
  disablePhoneticFitting: "Lautabgleich ausschalten",
  enablePhoneticFitting: "Lautabgleich einschalten",
  removeQuestion: "Entfernen?",
  confirm: "Bestätigen",
  loadMore: "Mehr laden",
  loading: "Lokales Wörterbuch wird geladen…",
  retry: "Erneut versuchen",
  unavailable: "Das lokale Wörterbuch ist vorübergehend nicht verfügbar.",
  superseded: "Eine neuere Matter-Version hat dieses lokale Wörterbuch gespeichert. Bitte dort öffnen.",
  damaged: "Das gespeicherte Wörterbuch ist beschädigt.",
  recover: "Wiederherstellen",
  recoverQuestion: "Beschädigte Daten durch das Ausgangswörterbuch ersetzen?",
  saved: "Lokal gespeichert.",
  failed: "Nicht gespeichert. Nach Aktualisierung erneut versuchen.",
  stale: "Das WIKI wurde in einem anderen Fenster geändert. Bitte erneut prüfen.",
  duplicate: "Dieses Wort ist bereits vorhanden oder kollidiert mit einem anderen Eintrag.",
  bounded: "Das lokale WIKI hat seine sichere Kapazitätsgrenze erreicht.",
  invalid: "Geben Sie ein gültiges Wort oder einen Namen ein.",
  exported: "Download gestartet",
  total: (count) => count === 1 ? "1 Wort" : `${count} Wörter`,
  count: (visible, total) => `${visible}/${total}`,
});

const COPY: Readonly<Record<CanvasLanguage, WikiSettingsCopy>> = Object.freeze({
  "en-US": ENGLISH,
  "zh-CN": SIMPLIFIED_CHINESE,
  "zh-TW": TRADITIONAL_CHINESE,
  "ja-JP": JAPANESE,
  "de-DE": GERMAN,
});

export function wikiSettingsCopy(language: CanvasLanguage): WikiSettingsCopy { return COPY[language]; }
Object.defineProperty(wikiSettingsCopy, "matterCapability", { value: "matter-capability:wiki-settings-copy" });

