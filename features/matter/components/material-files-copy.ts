import { MATTER_LOCALE, type MatterLocale } from "../config/locales";

/**
 * The material index's own copy. It was the one surface left hard-coded in
 * Simplified Chinese. Persistence recovery copy belongs to the explicit
 * Archive surface; this table owns only the quiet identity and tree actions.
 */
export type MaterialFilesCopy = Readonly<{
  archive: string;
  archivePanel: string;
  archiveExportCopy: string;
  archiveImportCopy: string;
  archiveRepairLocalStorage: string;
  archiveReloadStoredMaterial: string;
  archiveRetrySaving: string;
  archiveChooseMaterialArchive: string;
  archiveExporting: string;
  archiveChecking: string;
  archiveReplacing: string;
  archiveRepairing: string;
  archiveNoteDefault: string;
  archiveNoteCorrupt: string;
  archiveNoteConflict: string;
  archiveNoteStorageFull: string;
  archiveNoteSaveFailed: string;
  archiveConfirmReplace: string;
  archiveKeepCurrent: string;
  archiveReplace: string;
  canvasTitle: string;
  close: string;
  closeSearch: string;
  copied: string;
  copy: string;
  copySelectedThoughts: (count: number) => string;
  copyUnavailable: string;
  done: string;
  emptyFirstThought: string;
  emptyNoMatches: string;
  emptyNothingBranches: string;
  emptyNothingToSelect: string;
  emptyTypeToFind: string;
  filterMaterialFiles: string;
  findThought: string;
  hideMaterialFiles: string;
  includeWhenCopying: (title: string) => string;
  identityName: string;
  localOnly: string;
  materialFiles: string;
  materialTree: (count: number) => string;
  nameFor: (title: string) => string;
  renameCanvas: (title: string) => string;
  renameCanvasTitle: string;
  revisionCount: (count: number) => string;
  resultCount: (count: number) => string;
  saving: string;
  search: string;
  searchThoughts: string;
  select: string;
  selectedCount: (count: number) => string;
  selectForCopying: (title: string) => string;
  showMaterialFiles: string;
  showMaterialFilesSavingNeedsAttention: string;
  untitledMatter: string;
  untitledThought: string;
  collapseBranch: (title: string) => string;
  expandBranch: (title: string) => string;
  includeInWorkingContext: (title: string) => string;
  restoreAndView: (title: string) => string;
  setAsideFromWorkingContext: (title: string) => string;
}>;

const ENGLISH: MaterialFilesCopy = Object.freeze({
  archive: "Archive",
  archivePanel: "Material archive",
  archiveExportCopy: "Export a copy",
  archiveImportCopy: "Import a copy",
  archiveRepairLocalStorage: "Repair local storage",
  archiveReloadStoredMaterial: "Reload stored material",
  archiveRetrySaving: "Retry saving",
  archiveChooseMaterialArchive: "Choose a material archive",
  archiveExporting: "Exporting a copy…",
  archiveChecking: "Checking archive…",
  archiveReplacing: "Replacing material…",
  archiveRepairing: "Repairing local storage…",
  archiveNoteDefault: "Keep a portable copy, or bring one back into this material.",
  archiveNoteCorrupt: "Stored material is damaged. Export a recovery copy before Matter atomically replaces the local row.",
  archiveNoteConflict: "Another tab saved a newer copy. Reload the stored material here, or export the current copy first.",
  archiveNoteStorageFull: "Local storage is full. Export a copy before freeing browser storage, then retry saving.",
  archiveNoteSaveFailed: "Local saving did not finish. Export a copy before retrying if this material matters.",
  archiveConfirmReplace: "Replace current material? This clears undo, focus and selection.",
  archiveKeepCurrent: "Keep current",
  archiveReplace: "Replace",
  canvasTitle: "Canvas title",
  close: "Close",
  closeSearch: "Close search",
  copied: "Copied",
  copy: "Copy",
  copySelectedThoughts: (count) => `Copy ${count} selected thoughts`,
  copyUnavailable: "Copy unavailable",
  done: "Done",
  emptyFirstThought: "Speak the first thought to begin.",
  emptyNoMatches: "No material matches.",
  emptyNothingBranches: "Nothing branches from this thought yet.",
  emptyNothingToSelect: "Nothing to select in this material yet.",
  emptyTypeToFind: "Type to find a thought.",
  filterMaterialFiles: "Filter material files",
  findThought: "Find thought",
  hideMaterialFiles: "Hide material files",
  includeWhenCopying: (title) => `Include ${title} when copying`,
  identityName: "Quarrier",
  localOnly: "Kept only on this device",
  materialFiles: "Material files",
  materialTree: (count) => `Markdown material tree, ${count} entries`,
  nameFor: (title) => `Name for ${title}`,
  renameCanvas: (title) => `Rename canvas: ${title}`,
  renameCanvasTitle: "Rename canvas",
  revisionCount: (count) => `${count} committed revisions`,
  resultCount: (count) => `${count} material ${count === 1 ? "result" : "results"}`,
  saving: "Saving to this device",
  search: "Search",
  searchThoughts: "Search thoughts",
  select: "Select",
  selectedCount: (count) => `${count} selected`,
  selectForCopying: (title) => `Select ${title} for copying`,
  showMaterialFiles: "Show material files",
  showMaterialFilesSavingNeedsAttention: "Show material files; saving needs attention",
  untitledMatter: "Untitled matter",
  untitledThought: "Untitled thought",
  collapseBranch: (title) => `Collapse ${title} in the material index`,
  expandBranch: (title) => `Expand ${title} in the material index`,
  includeInWorkingContext: (title) => `Include ${title} in the material on this canvas and reopen its branch`,
  restoreAndView: (title) => `Include ${title} in the material on this canvas and view it`,
  setAsideFromWorkingContext: (title) => `Set ${title} aside from the material on this canvas and compact its branch`,
});

const SIMPLIFIED_CHINESE: MaterialFilesCopy = Object.freeze({
  archive: "归档",
  archivePanel: "材料归档",
  archiveExportCopy: "导出副本",
  archiveImportCopy: "导入副本",
  archiveRepairLocalStorage: "修复本地存储",
  archiveReloadStoredMaterial: "重新载入已存材料",
  archiveRetrySaving: "重新保存",
  archiveChooseMaterialArchive: "选择材料归档文件",
  archiveExporting: "正在导出副本…",
  archiveChecking: "正在检查归档…",
  archiveReplacing: "正在替换材料…",
  archiveRepairing: "正在修复本地存储…",
  archiveNoteDefault: "保留一份可携带的副本，或把一份副本带回这份材料。",
  archiveNoteCorrupt: "已存材料已损坏。请先导出恢复副本，再让 Matter 原子替换本地记录。",
  archiveNoteConflict: "另一个标签页保存了更新的副本。可在这里重新载入已存材料，或先导出当前副本。",
  archiveNoteStorageFull: "本地存储已满。请先导出副本、释放浏览器存储后，再重试保存。",
  archiveNoteSaveFailed: "本地保存未完成。若这份材料很重要，请先导出副本再重试。",
  archiveConfirmReplace: "替换当前材料吗？这会清除撤销、聚焦和选择状态。",
  archiveKeepCurrent: "保留当前材料",
  archiveReplace: "替换",
  canvasTitle: "画布标题",
  close: "关闭",
  closeSearch: "关闭搜索",
  copied: "已复制",
  copy: "复制",
  copySelectedThoughts: (count) => `复制已选的 ${count} 段想法`,
  copyUnavailable: "暂时无法复制",
  done: "完成",
  emptyFirstThought: "说出第一个想法，开始吧。",
  emptyNoMatches: "没有找到材料。",
  emptyNothingBranches: "这段想法还没有分支。",
  emptyNothingToSelect: "这份材料里还没有可选内容。",
  emptyTypeToFind: "输入内容来寻找想法。",
  filterMaterialFiles: "筛选材料文件",
  findThought: "寻找想法",
  hideMaterialFiles: "隐藏材料文件",
  includeWhenCopying: (title) => `复制时包含：${title}`,
  identityName: "采石者",
  localOnly: "仅存于这台设备",
  materialFiles: "材料文件",
  materialTree: (count) => `Markdown 材料树，共 ${count} 项`,
  nameFor: (title) => `为此想法命名：${title}`,
  renameCanvas: (title) => `重命名画布：${title}`,
  renameCanvasTitle: "重命名画布",
  revisionCount: (count) => `已提交 ${count} 次修改`,
  resultCount: (count) => `找到 ${count} 项材料`,
  saving: "正在存到这台设备",
  search: "搜索",
  searchThoughts: "搜索想法",
  select: "选择",
  selectedCount: (count) => `已选 ${count} 项`,
  selectForCopying: (title) => `选择 ${title} 以便复制`,
  showMaterialFiles: "显示材料文件",
  showMaterialFilesSavingNeedsAttention: "显示材料文件；保存需要处理",
  untitledMatter: "未命名材料",
  untitledThought: "未命名想法",
  collapseBranch: (title) => `在材料目录中收起：${title}`,
  expandBranch: (title) => `在材料目录中展开：${title}`,
  includeInWorkingContext: (title) => `重新纳入画面里的材料，并展开下方分支：${title}`,
  restoreAndView: (title) => `重新纳入画面里的材料并查看：${title}`,
  setAsideFromWorkingContext: (title) => `暂时不纳入画面里的材料，并收起下方分支：${title}`,
});

const TRADITIONAL_CHINESE: MaterialFilesCopy = Object.freeze({
  archive: "封存",
  archivePanel: "材料封存",
  archiveExportCopy: "匯出副本",
  archiveImportCopy: "匯入副本",
  archiveRepairLocalStorage: "修復本機儲存",
  archiveReloadStoredMaterial: "重新載入已存材料",
  archiveRetrySaving: "重新儲存",
  archiveChooseMaterialArchive: "選擇材料封存檔案",
  archiveExporting: "正在匯出副本…",
  archiveChecking: "正在檢查封存…",
  archiveReplacing: "正在替換材料…",
  archiveRepairing: "正在修復本機儲存…",
  archiveNoteDefault: "保留一份可攜副本，或把一份副本帶回這份材料。",
  archiveNoteCorrupt: "已存材料已損壞。請先匯出復原副本，再讓 Matter 原子替換本機記錄。",
  archiveNoteConflict: "另一個分頁儲存了較新的副本。可在這裡重新載入已存材料，或先匯出目前副本。",
  archiveNoteStorageFull: "本機儲存已滿。請先匯出副本、釋放瀏覽器儲存後，再重試儲存。",
  archiveNoteSaveFailed: "本機儲存未完成。若這份材料很重要，請先匯出副本再重試。",
  archiveConfirmReplace: "要替換目前材料嗎？這會清除復原、聚焦和選取狀態。",
  archiveKeepCurrent: "保留目前材料",
  archiveReplace: "替換",
  canvasTitle: "畫布標題",
  close: "關閉",
  closeSearch: "關閉搜尋",
  copied: "已複製",
  copy: "複製",
  copySelectedThoughts: (count) => `複製已選的 ${count} 段想法`,
  copyUnavailable: "暫時無法複製",
  done: "完成",
  emptyFirstThought: "說出第一個想法，開始吧。",
  emptyNoMatches: "沒有找到材料。",
  emptyNothingBranches: "這段想法還沒有分支。",
  emptyNothingToSelect: "這份材料裡還沒有可選內容。",
  emptyTypeToFind: "輸入內容來尋找想法。",
  filterMaterialFiles: "篩選材料檔案",
  findThought: "尋找想法",
  hideMaterialFiles: "隱藏材料檔案",
  includeWhenCopying: (title) => `複製時包含：${title}`,
  identityName: "採石者",
  localOnly: "僅存於這台裝置",
  materialFiles: "材料檔案",
  materialTree: (count) => `Markdown 材料樹，共 ${count} 項`,
  nameFor: (title) => `為此想法命名：${title}`,
  renameCanvas: (title) => `重新命名畫布：${title}`,
  renameCanvasTitle: "重新命名畫布",
  revisionCount: (count) => `已提交 ${count} 次變更`,
  resultCount: (count) => `找到 ${count} 項材料`,
  saving: "正在存到這台裝置",
  search: "搜尋",
  searchThoughts: "搜尋想法",
  select: "選取",
  selectedCount: (count) => `已選 ${count} 項`,
  selectForCopying: (title) => `選取 ${title} 以便複製`,
  showMaterialFiles: "顯示材料檔案",
  showMaterialFilesSavingNeedsAttention: "顯示材料檔案；儲存需要處理",
  untitledMatter: "未命名材料",
  untitledThought: "未命名想法",
  collapseBranch: (title) => `在材料目錄中收起：${title}`,
  expandBranch: (title) => `在材料目錄中展開：${title}`,
  includeInWorkingContext: (title) => `重新納入畫面裡的材料，並展開下方分支：${title}`,
  restoreAndView: (title) => `重新納入畫面裡的材料並查看：${title}`,
  setAsideFromWorkingContext: (title) => `暫時不納入畫面裡的材料，並收起下方分支：${title}`,
});

const JAPANESE: MaterialFilesCopy = Object.freeze({
  archive: "アーカイブ",
  archivePanel: "素材のアーカイブ",
  archiveExportCopy: "コピーを書き出す",
  archiveImportCopy: "コピーを読み込む",
  archiveRepairLocalStorage: "端末内ストレージを修復",
  archiveReloadStoredMaterial: "保存済みの素材を再読み込み",
  archiveRetrySaving: "保存を再試行",
  archiveChooseMaterialArchive: "素材アーカイブを選択",
  archiveExporting: "コピーを書き出しています…",
  archiveChecking: "アーカイブを確認しています…",
  archiveReplacing: "素材を置き換えています…",
  archiveRepairing: "端末内ストレージを修復しています…",
  archiveNoteDefault: "持ち運べるコピーを保管するか、この素材にコピーを戻せます。",
  archiveNoteCorrupt: "保存済みの素材が壊れています。Matter が端末の記録を原子的に置き換える前に、復旧用コピーを書き出してください。",
  archiveNoteConflict: "別のタブがより新しいコピーを保存しました。ここで保存済みの素材を再読み込みするか、先に現在のコピーを書き出してください。",
  archiveNoteStorageFull: "端末内ストレージがいっぱいです。ブラウザの空き容量を作る前にコピーを書き出し、その後保存を再試行してください。",
  archiveNoteSaveFailed: "端末への保存が完了しませんでした。この素材が大切なら、再試行前にコピーを書き出してください。",
  archiveConfirmReplace: "現在の素材を置き換えますか？取り消し、フォーカス、選択が消去されます。",
  archiveKeepCurrent: "現在の素材を保持",
  archiveReplace: "置き換える",
  canvasTitle: "キャンバスのタイトル",
  close: "閉じる",
  closeSearch: "検索を閉じる",
  copied: "コピーしました",
  copy: "コピー",
  copySelectedThoughts: (count) => `選択した${count}件の考えをコピー`,
  copyUnavailable: "コピーできません",
  done: "完了",
  emptyFirstThought: "最初の考えを話して始めましょう。",
  emptyNoMatches: "一致する素材はありません。",
  emptyNothingBranches: "この考えからはまだ分岐していません。",
  emptyNothingToSelect: "この素材にはまだ選択できるものがありません。",
  emptyTypeToFind: "考えを探す言葉を入力してください。",
  filterMaterialFiles: "素材ファイルを絞り込む",
  findThought: "考えを探す",
  hideMaterialFiles: "素材ファイルを隠す",
  includeWhenCopying: (title) => `コピーに${title}を含める`,
  identityName: "石を切る人",
  localOnly: "この端末にのみ保存",
  materialFiles: "素材ファイル",
  materialTree: (count) => `Markdown 素材ツリー、${count}件`,
  nameFor: (title) => `${title}の名前`,
  renameCanvas: (title) => `キャンバス名を変更：${title}`,
  renameCanvasTitle: "キャンバス名を変更",
  revisionCount: (count) => `${count}件の変更を保存済み`,
  resultCount: (count) => `${count}件の素材`,
  saving: "この端末に保存中",
  search: "検索",
  searchThoughts: "考えを検索",
  select: "選択",
  selectedCount: (count) => `${count}件を選択`,
  selectForCopying: (title) => `コピーする${title}を選択`,
  showMaterialFiles: "素材ファイルを表示",
  showMaterialFilesSavingNeedsAttention: "素材ファイルを表示；保存に対応が必要です",
  untitledMatter: "無題の素材",
  untitledThought: "無題の考え",
  collapseBranch: (title) => `素材一覧で分岐を閉じる：${title}`,
  expandBranch: (title) => `素材一覧で分岐を開く：${title}`,
  includeInWorkingContext: (title) => `この画面で扱う素材に戻し、分岐を開く：${title}`,
  restoreAndView: (title) => `この画面で扱う素材に戻して表示：${title}`,
  setAsideFromWorkingContext: (title) => `この画面で扱う素材から外し、分岐をたたむ：${title}`,
});

const GERMAN: MaterialFilesCopy = Object.freeze({
  archive: "Archiv",
  archivePanel: "Materialarchiv",
  archiveExportCopy: "Kopie exportieren",
  archiveImportCopy: "Kopie importieren",
  archiveRepairLocalStorage: "Lokalen Speicher reparieren",
  archiveReloadStoredMaterial: "Gespeichertes Material neu laden",
  archiveRetrySaving: "Speichern erneut versuchen",
  archiveChooseMaterialArchive: "Materialarchiv auswählen",
  archiveExporting: "Kopie wird exportiert…",
  archiveChecking: "Archiv wird geprüft…",
  archiveReplacing: "Material wird ersetzt…",
  archiveRepairing: "Lokaler Speicher wird repariert…",
  archiveNoteDefault: "Bewahren Sie eine portable Kopie auf oder holen Sie eine Kopie in dieses Material zurück.",
  archiveNoteCorrupt: "Gespeichertes Material ist beschädigt. Exportieren Sie eine Wiederherstellungskopie, bevor Matter den lokalen Eintrag atomar ersetzt.",
  archiveNoteConflict: "Ein anderer Tab hat eine neuere Kopie gespeichert. Laden Sie hier das gespeicherte Material neu oder exportieren Sie zuerst die aktuelle Kopie.",
  archiveNoteStorageFull: "Der lokale Speicher ist voll. Exportieren Sie eine Kopie, geben Sie Browser-Speicher frei und versuchen Sie das Speichern dann erneut.",
  archiveNoteSaveFailed: "Das lokale Speichern wurde nicht abgeschlossen. Exportieren Sie eine Kopie, bevor Sie erneut versuchen zu speichern, wenn dieses Material wichtig ist.",
  archiveConfirmReplace: "Aktuelles Material ersetzen? Dadurch werden Rückgängig, Fokus und Auswahl gelöscht.",
  archiveKeepCurrent: "Aktuelles Material behalten",
  archiveReplace: "Ersetzen",
  canvasTitle: "Canvas-Titel",
  close: "Schließen",
  closeSearch: "Suche schließen",
  copied: "Kopiert",
  copy: "Kopieren",
  copySelectedThoughts: (count) => `${count} ausgewählte Gedanken kopieren`,
  copyUnavailable: "Kopieren nicht verfügbar",
  done: "Fertig",
  emptyFirstThought: "Sprechen Sie den ersten Gedanken, um zu beginnen.",
  emptyNoMatches: "Kein Material gefunden.",
  emptyNothingBranches: "Von diesem Gedanken zweigt noch nichts ab.",
  emptyNothingToSelect: "In diesem Material gibt es noch nichts auszuwählen.",
  emptyTypeToFind: "Geben Sie etwas ein, um einen Gedanken zu finden.",
  filterMaterialFiles: "Materialdateien filtern",
  findThought: "Gedanken finden",
  hideMaterialFiles: "Materialdateien ausblenden",
  includeWhenCopying: (title) => `${title} beim Kopieren einbeziehen`,
  identityName: "Steinbrecher",
  localOnly: "Nur auf diesem Gerät",
  materialFiles: "Materialdateien",
  materialTree: (count) => `Markdown-Materialbaum, ${count} Einträge`,
  nameFor: (title) => `Name für ${title}`,
  renameCanvas: (title) => `Canvas umbenennen: ${title}`,
  renameCanvasTitle: "Canvas umbenennen",
  revisionCount: (count) => `${count} Änderungen gespeichert`,
  resultCount: (count) => `${count} Material${count === 1 ? "treffer" : "treffer"}`,
  saving: "Wird auf diesem Gerät gespeichert",
  search: "Suchen",
  searchThoughts: "Gedanken suchen",
  select: "Auswählen",
  selectedCount: (count) => `${count} ausgewählt`,
  selectForCopying: (title) => `${title} zum Kopieren auswählen`,
  showMaterialFiles: "Materialdateien anzeigen",
  showMaterialFilesSavingNeedsAttention: "Materialdateien anzeigen; Speichern braucht Aufmerksamkeit",
  untitledMatter: "Unbenanntes Material",
  untitledThought: "Unbenannter Gedanke",
  collapseBranch: (title) => `${title} im Materialindex schließen`,
  expandBranch: (title) => `${title} im Materialindex öffnen`,
  includeInWorkingContext: (title) => `${title} wieder in das Material dieser Fläche aufnehmen und den Zweig öffnen`,
  restoreAndView: (title) => `${title} wieder aufnehmen und anzeigen`,
  setAsideFromWorkingContext: (title) => `${title} aus dem Material dieser Fläche ausnehmen und den Zweig schließen`,
});

const BY_LOCALE: Readonly<Record<MatterLocale, MaterialFilesCopy>> = Object.freeze({
  [MATTER_LOCALE.english]: ENGLISH,
  [MATTER_LOCALE.simplifiedChinese]: SIMPLIFIED_CHINESE,
  [MATTER_LOCALE.traditionalChinese]: TRADITIONAL_CHINESE,
  [MATTER_LOCALE.japanese]: JAPANESE,
  [MATTER_LOCALE.german]: GERMAN,
});

export function materialFilesCopy(locale: MatterLocale): MaterialFilesCopy {
  return BY_LOCALE[locale] ?? SIMPLIFIED_CHINESE;
}
