import { MATTER_LOCALE, type MatterLocale } from "../config/locales";

const ENGLISH_PLURAL = new Intl.PluralRules(MATTER_LOCALE.english);
const GERMAN_PLURAL = new Intl.PluralRules(MATTER_LOCALE.german);

/** Chooses a count's noun form by the locale's own plural category. */
function counted(rules: Intl.PluralRules, count: number, one: string, other: string): string {
  return rules.select(count) === "one" ? one : other;
}

/**
 * The material index's own copy: the quiet identity and its one durability
 * line, tree actions, and the explicit Archive surface where every recovery
 * control lives, including the archive errors it reports.
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
  archiveConfirmOlder: string;
  archiveConfirmReplaceUnsaved: string;
  archiveErrorAction: string;
  /** Replacing would end work in progress: held spoken words, a turn, a question, a name. */
  archiveErrorBusy: string;
  archiveErrorCleared: string;
  archiveErrorConflict: string;
  archiveErrorCorrupt: string;
  archiveErrorDirty: string;
  archiveErrorSaving: string;
  archiveErrorForeign: string;
  archiveErrorInvalid: string;
  archiveErrorInvalidTree: string;
  archiveErrorSaveFailed: string;
  archiveErrorStale: string;
  archiveErrorStorageFull: string;
  archiveErrorSuperseded: string;
  archiveErrorTooLarge: string;
  archiveErrorUnavailable: string;
  archiveErrorUnsupported: string;
  archiveNoteCleared: string;
  archiveNoteDiverged: string;
  archiveNoteHistoryReleased: string;
  archiveNoteHistoryUnavailable: string;
  archiveNoteNotPersisted: string;
  archiveNoteSuperseded: string;
  archiveNoteUnavailable: string;
  archiveNoteUpgradeBlocked: string;
  archiveReloadPage: string;
  durabilityCleared: string;
  durabilityDiverged: string;
  durabilityNewerCopy: string;
  durabilityNewerMatter: string;
  durabilityNotSaved: string;
  durabilityNotSaving: string;
  durabilityUpgradeBlocked: string;
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
  historyReleased: string;
  historyUnavailable: string;
  includeWhenCopying: (title: string) => string;
  identityName: string;
  localOnly: string;
  materialFiles: string;
  materialTree: (count: number) => string;
  nameFor: (title: string) => string;
  nameNotSaved: string;
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
  archiveConfirmOlder: "Changes made after this archive will be lost.",
  archiveConfirmReplaceUnsaved: "Replace unsaved material with this archive? Undo history will be cleared.",
  archiveErrorAction: "Archive action could not finish.",
  archiveErrorBusy: "Something you started is still in progress. Finish or discard it, then try again.",
  archiveErrorCleared: "Local storage for Matter was cleared. Export a copy, then reload.",
  archiveErrorConflict: "A different copy of this material is already stored here.",
  archiveErrorCorrupt: "Stored material must be repaired before importing.",
  archiveErrorDirty: "Unsaved material is waiting. Retry saving, or export a copy first.",
  archiveErrorSaving: "Material is still saving. Try again in a moment.",
  archiveErrorForeign: "This preview can restore only a copy of the current document.",
  archiveErrorInvalid: "This archive is not valid Matter material.",
  archiveErrorInvalidTree: "This material cannot be restored.",
  archiveErrorSaveFailed: "This browser could not save the imported material.",
  archiveErrorStale: "Material changed while this archive was being prepared. Review it and try again.",
  archiveErrorStorageFull: "Storage is still full. Free browser storage, then try again.",
  archiveErrorSuperseded: "A newer Matter is open in another tab. Export a copy, then reload.",
  archiveErrorTooLarge: "This archive exceeds Matter’s supported size.",
  archiveErrorUnavailable: "Archive support is unavailable in this browser.",
  archiveErrorUnsupported: "This archive contains unsupported files or paths.",
  archiveNoteCleared: "Local storage for Matter was cleared, by another tab or by the browser. Export a copy of this page’s material before reloading.",
  archiveNoteDiverged: "This page changed while stored material was loading, and the two differ. Reload the stored material here, or export this page’s copy first.",
  archiveNoteHistoryReleased: "Storage is nearly full, so older undo steps are not being saved. The material is saved, and this tab can still undo them until it closes.",
  archiveNoteHistoryUnavailable: "Some earlier changes could not be restored and can no longer be undone. The material itself is intact.",
  archiveNoteNotPersisted: "This browser may clear local storage when space runs low, so keep an exported copy.",
  archiveNoteSuperseded: "A newer version of Matter is open in another tab and now owns local storage. Export a copy of this page’s material, then reload.",
  archiveNoteUnavailable: "This browser is not saving Matter material, for example in a private window. Export a copy to keep it.",
  archiveNoteUpgradeBlocked: "Matter is updating local storage. Close other Matter tabs so it can finish.",
  archiveReloadPage: "Reload",
  durabilityCleared: "Local storage was cleared",
  durabilityDiverged: "This page and stored material differ",
  durabilityNewerCopy: "A newer copy is open in another tab",
  durabilityNewerMatter: "A newer Matter is open in another tab",
  durabilityNotSaved: "Not saved on this device",
  durabilityNotSaving: "Not saving in this browser",
  durabilityUpgradeBlocked: "Close other Matter tabs to finish updating",
  archiveKeepCurrent: "Keep current",
  archiveReplace: "Replace",
  canvasTitle: "Canvas title",
  close: "Close",
  closeSearch: "Close search",
  copied: "Copied",
  copy: "Copy",
  copySelectedThoughts: (count) =>
    `Copy ${count} selected ${counted(ENGLISH_PLURAL, count, "thought", "thoughts")}`,
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
  historyReleased: "Older undo steps won’t be kept after reload",
  historyUnavailable: "Earlier changes can no longer be undone",
  includeWhenCopying: (title) => `Include ${title} when copying`,
  identityName: "Quarrier",
  localOnly: "Kept only on this device",
  materialFiles: "Material files",
  materialTree: (count) =>
    `Markdown material tree, ${count} ${counted(ENGLISH_PLURAL, count, "entry", "entries")}`,
  nameFor: (title) => `Name for ${title}`,
  nameNotSaved: "This name was not saved. Press Enter to try again.",
  renameCanvas: (title) => `Rename canvas: ${title}`,
  renameCanvasTitle: "Rename canvas",
  revisionCount: (count) =>
    `${count} committed ${counted(ENGLISH_PLURAL, count, "revision", "revisions")}`,
  resultCount: (count) => `${count} material ${counted(ENGLISH_PLURAL, count, "result", "results")}`,
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
  archiveConfirmOlder: "这份归档之后做出的更改将会丢失。",
  archiveConfirmReplaceUnsaved: "用这份归档替换尚未保存的材料吗？撤销历史将被清除。",
  archiveErrorAction: "归档操作未能完成。",
  archiveErrorBusy: "你开始的操作仍在进行中。请先完成或放弃它，再重试。",
  archiveErrorCleared: "Matter 的本地存储已被清除。请先导出副本，再重新载入。",
  archiveErrorConflict: "这里已存有这份材料的另一个副本。",
  archiveErrorCorrupt: "导入前需要先修复已存材料。",
  archiveErrorDirty: "有尚未保存的材料。请先重新保存，或先导出副本。",
  archiveErrorSaving: "材料仍在保存。请稍后再试。",
  archiveErrorForeign: "此预览版只能恢复当前文档的副本。",
  archiveErrorInvalid: "这不是有效的 Matter 材料归档。",
  archiveErrorInvalidTree: "这份材料无法恢复。",
  archiveErrorSaveFailed: "此浏览器无法保存导入的材料。",
  archiveErrorStale: "准备归档期间材料发生了变化。请检查后重试。",
  archiveErrorStorageFull: "存储空间仍然已满。请释放浏览器存储后重试。",
  archiveErrorSuperseded: "另一个标签页打开了更新版的 Matter。请先导出副本，再重新载入。",
  archiveErrorTooLarge: "这份归档超出了 Matter 支持的大小。",
  archiveErrorUnavailable: "此浏览器不支持归档功能。",
  archiveErrorUnsupported: "这份归档包含不支持的文件或路径。",
  archiveNoteCleared: "Matter 的本地存储已被另一个标签页或浏览器清除。重新载入前，请先导出这一页的材料副本。",
  archiveNoteDiverged: "载入已存材料期间，这一页发生了改动，两者现已不一致。可在这里重新载入已存材料，或先导出这一页的副本。",
  archiveNoteHistoryReleased: "存储空间将满，较早的撤销步骤不再保存。材料已保存；在这个标签页关闭前仍可撤销它们。",
  archiveNoteHistoryUnavailable: "部分更早的更改无法恢复，已不能撤销。材料本身完好无损。",
  archiveNoteNotPersisted: "空间不足时，浏览器可能清除本地存储，请保留一份导出的副本。",
  archiveNoteSuperseded: "另一个标签页打开了更新版的 Matter，本地存储已由它接管。请先导出这一页的材料副本，再重新载入。",
  archiveNoteUnavailable: "此浏览器没有保存 Matter 材料（例如在无痕窗口中）。请导出副本来保留它。",
  archiveNoteUpgradeBlocked: "Matter 正在更新本地存储。请关闭其他 Matter 标签页，让更新完成。",
  archiveReloadPage: "重新载入",
  durabilityCleared: "本地存储已被清除",
  durabilityDiverged: "这一页与已存材料不一致",
  durabilityNewerCopy: "另一个标签页有更新的副本",
  durabilityNewerMatter: "另一个标签页打开了更新版的 Matter",
  durabilityNotSaved: "尚未存到这台设备",
  durabilityNotSaving: "此浏览器未在保存",
  durabilityUpgradeBlocked: "关闭其他 Matter 标签页以完成更新",
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
  historyReleased: "重新载入后不再保留较早的撤销步骤",
  historyUnavailable: "更早的更改已无法撤销",
  includeWhenCopying: (title) => `复制时包含：${title}`,
  identityName: "采石者",
  localOnly: "仅存于这台设备",
  materialFiles: "材料文件",
  materialTree: (count) => `Markdown 材料树，共 ${count} 项`,
  nameFor: (title) => `为此想法命名：${title}`,
  nameNotSaved: "这个名字还没有保存。按回车再试一次。",
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
  archiveConfirmOlder: "這份封存之後做出的變更將會遺失。",
  archiveConfirmReplaceUnsaved: "要用這份封存替換尚未儲存的材料嗎？復原記錄將被清除。",
  archiveErrorAction: "封存操作未能完成。",
  archiveErrorBusy: "你開始的操作仍在進行中。請先完成或放棄它，再試一次。",
  archiveErrorCleared: "Matter 的本機儲存已被清除。請先匯出副本，再重新載入。",
  archiveErrorConflict: "這裡已存有這份材料的另一個副本。",
  archiveErrorCorrupt: "匯入前需要先修復已存材料。",
  archiveErrorDirty: "有尚未儲存的材料。請先重新儲存，或先匯出副本。",
  archiveErrorSaving: "材料仍在儲存。請稍後再試。",
  archiveErrorForeign: "此預覽版只能還原目前文件的副本。",
  archiveErrorInvalid: "這不是有效的 Matter 材料封存。",
  archiveErrorInvalidTree: "這份材料無法還原。",
  archiveErrorSaveFailed: "此瀏覽器無法儲存匯入的材料。",
  archiveErrorStale: "準備封存期間材料發生了變化。請檢查後再試一次。",
  archiveErrorStorageFull: "儲存空間仍然已滿。請釋放瀏覽器儲存後再試一次。",
  archiveErrorSuperseded: "另一個分頁開啟了較新版的 Matter。請先匯出副本，再重新載入。",
  archiveErrorTooLarge: "這份封存超出了 Matter 支援的大小。",
  archiveErrorUnavailable: "此瀏覽器不支援封存功能。",
  archiveErrorUnsupported: "這份封存包含不支援的檔案或路徑。",
  archiveNoteCleared: "Matter 的本機儲存已被另一個分頁或瀏覽器清除。重新載入前，請先匯出這一頁的材料副本。",
  archiveNoteDiverged: "載入已存材料期間，這一頁有了改動，兩者現已不一致。可在這裡重新載入已存材料，或先匯出這一頁的副本。",
  archiveNoteHistoryReleased: "儲存空間將滿，較早的復原步驟不再儲存。材料已儲存；在這個分頁關閉前仍可復原它們。",
  archiveNoteHistoryUnavailable: "部分較早的變更無法還原，已不能復原。材料本身完好無損。",
  archiveNoteNotPersisted: "空間不足時，瀏覽器可能清除本機儲存，請保留一份匯出的副本。",
  archiveNoteSuperseded: "另一個分頁開啟了較新版的 Matter，本機儲存已由它接管。請先匯出這一頁的材料副本，再重新載入。",
  archiveNoteUnavailable: "此瀏覽器沒有儲存 Matter 材料（例如在無痕視窗中）。請匯出副本來保留它。",
  archiveNoteUpgradeBlocked: "Matter 正在更新本機儲存。請關閉其他 Matter 分頁，讓更新完成。",
  archiveReloadPage: "重新載入",
  durabilityCleared: "本機儲存已被清除",
  durabilityDiverged: "這一頁與已存材料不一致",
  durabilityNewerCopy: "另一個分頁有較新的副本",
  durabilityNewerMatter: "另一個分頁開啟了較新版的 Matter",
  durabilityNotSaved: "尚未存到這台裝置",
  durabilityNotSaving: "此瀏覽器未在儲存",
  durabilityUpgradeBlocked: "關閉其他 Matter 分頁以完成更新",
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
  historyReleased: "重新載入後不再保留較早的復原步驟",
  historyUnavailable: "較早的變更已無法復原",
  includeWhenCopying: (title) => `複製時包含：${title}`,
  identityName: "採石者",
  localOnly: "僅存於這台裝置",
  materialFiles: "材料檔案",
  materialTree: (count) => `Markdown 材料樹，共 ${count} 項`,
  nameFor: (title) => `為此想法命名：${title}`,
  nameNotSaved: "這個名稱尚未儲存。按 Enter 再試一次。",
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
  archiveConfirmOlder: "このアーカイブ以降の変更は失われます。",
  archiveConfirmReplaceUnsaved: "保存されていない素材をこのアーカイブで置き換えますか？取り消し履歴は消去されます。",
  archiveErrorAction: "アーカイブの操作を完了できませんでした。",
  archiveErrorBusy: "始めた操作がまだ進行中です。完了するか破棄してから、もう一度お試しください。",
  archiveErrorCleared: "Matter の端末内ストレージが消去されました。コピーを書き出してから再読み込みしてください。",
  archiveErrorConflict: "この素材の別のコピーがすでに保存されています。",
  archiveErrorCorrupt: "読み込む前に保存済みの素材を修復する必要があります。",
  archiveErrorDirty: "保存されていない素材があります。保存を再試行するか、先にコピーを書き出してください。",
  archiveErrorSaving: "素材はまだ保存中です。少し待ってからもう一度お試しください。",
  archiveErrorForeign: "このプレビューでは現在のドキュメントのコピーしか復元できません。",
  archiveErrorInvalid: "これは有効な Matter 素材のアーカイブではありません。",
  archiveErrorInvalidTree: "この素材は復元できません。",
  archiveErrorSaveFailed: "このブラウザは読み込んだ素材を保存できませんでした。",
  archiveErrorStale: "アーカイブの準備中に素材が変わりました。確認してからもう一度お試しください。",
  archiveErrorStorageFull: "ストレージはまだいっぱいです。ブラウザの空き容量を作ってから、もう一度お試しください。",
  archiveErrorSuperseded: "別のタブで新しい Matter が開いています。コピーを書き出してから再読み込みしてください。",
  archiveErrorTooLarge: "このアーカイブは Matter が扱えるサイズを超えています。",
  archiveErrorUnavailable: "このブラウザではアーカイブを使えません。",
  archiveErrorUnsupported: "このアーカイブには対応していないファイルやパスが含まれています。",
  archiveNoteCleared: "Matter の端末内ストレージが、別のタブまたはブラウザによって消去されました。再読み込みする前に、このページの素材のコピーを書き出してください。",
  archiveNoteDiverged: "保存済みの素材を読み込んでいる間にこのページが変更され、両者が異なっています。ここで保存済みの素材を再読み込みするか、先にこのページのコピーを書き出してください。",
  archiveNoteHistoryReleased: "ストレージが残りわずかなため、古い取り消し履歴は保存していません。素材は保存済みで、このタブを閉じるまでは取り消せます。",
  archiveNoteHistoryUnavailable: "以前の変更の一部を復元できず、取り消せなくなりました。素材そのものは無事です。",
  archiveNoteNotPersisted: "空き容量が少なくなると、ブラウザが端末内ストレージを消去することがあります。書き出したコピーを保管してください。",
  archiveNoteSuperseded: "別のタブで新しいバージョンの Matter が開かれ、端末内ストレージを引き継ぎました。このページの素材のコピーを書き出してから再読み込みしてください。",
  archiveNoteUnavailable: "このブラウザは Matter の素材を保存していません（プライベートウィンドウなど）。残すにはコピーを書き出してください。",
  archiveNoteUpgradeBlocked: "Matter が端末内ストレージを更新しています。完了させるには他の Matter タブを閉じてください。",
  archiveReloadPage: "再読み込み",
  durabilityCleared: "端末内ストレージが消去されました",
  durabilityDiverged: "このページと保存済みの素材が異なります",
  durabilityNewerCopy: "別のタブに新しいコピーがあります",
  durabilityNewerMatter: "別のタブで新しい Matter が開いています",
  durabilityNotSaved: "この端末に保存されていません",
  durabilityNotSaving: "このブラウザでは保存していません",
  durabilityUpgradeBlocked: "更新を完了するには他の Matter タブを閉じてください",
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
  historyReleased: "再読み込み後は古い取り消し履歴を保持しません",
  historyUnavailable: "以前の変更は取り消せなくなりました",
  includeWhenCopying: (title) => `コピーに${title}を含める`,
  identityName: "石を切る人",
  localOnly: "この端末にのみ保存",
  materialFiles: "素材ファイル",
  materialTree: (count) => `Markdown 素材ツリー、${count}件`,
  nameFor: (title) => `${title}の名前`,
  nameNotSaved: "この名前は保存されていません。Enter でもう一度試せます。",
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
  archiveConfirmOlder: "Änderungen nach diesem Archiv gehen verloren.",
  archiveConfirmReplaceUnsaved: "Nicht gespeichertes Material durch dieses Archiv ersetzen? Der Rückgängig-Verlauf wird gelöscht.",
  archiveErrorAction: "Die Archivaktion konnte nicht abgeschlossen werden.",
  archiveErrorBusy: "Etwas, das Sie begonnen haben, läuft noch. Schließen Sie es ab oder verwerfen Sie es, dann versuchen Sie es erneut.",
  archiveErrorCleared: "Der lokale Speicher von Matter wurde gelöscht. Exportieren Sie eine Kopie und laden Sie dann neu.",
  archiveErrorConflict: "Hier ist bereits eine andere Kopie dieses Materials gespeichert.",
  archiveErrorCorrupt: "Gespeichertes Material muss vor dem Import repariert werden.",
  archiveErrorDirty: "Nicht gespeichertes Material wartet. Versuchen Sie erneut zu speichern oder exportieren Sie zuerst eine Kopie.",
  archiveErrorSaving: "Das Material wird noch gespeichert. Versuchen Sie es gleich noch einmal.",
  archiveErrorForeign: "Diese Vorschau kann nur eine Kopie des aktuellen Dokuments wiederherstellen.",
  archiveErrorInvalid: "Dies ist kein gültiges Matter-Materialarchiv.",
  archiveErrorInvalidTree: "Dieses Material kann nicht wiederhergestellt werden.",
  archiveErrorSaveFailed: "Dieser Browser konnte das importierte Material nicht speichern.",
  archiveErrorStale: "Das Material hat sich geändert, während dieses Archiv vorbereitet wurde. Prüfen Sie es und versuchen Sie es erneut.",
  archiveErrorStorageFull: "Der Speicher ist noch voll. Geben Sie Browser-Speicher frei und versuchen Sie es erneut.",
  archiveErrorSuperseded: "In einem anderen Tab ist ein neueres Matter offen. Exportieren Sie eine Kopie und laden Sie dann neu.",
  archiveErrorTooLarge: "Dieses Archiv überschreitet die von Matter unterstützte Größe.",
  archiveErrorUnavailable: "Archive werden in diesem Browser nicht unterstützt.",
  archiveErrorUnsupported: "Dieses Archiv enthält nicht unterstützte Dateien oder Pfade.",
  archiveNoteCleared: "Der lokale Speicher von Matter wurde von einem anderen Tab oder vom Browser gelöscht. Exportieren Sie vor dem Neuladen eine Kopie des Materials dieser Seite.",
  archiveNoteDiverged: "Diese Seite wurde geändert, während gespeichertes Material geladen wurde, und beide weichen voneinander ab. Laden Sie hier das gespeicherte Material neu oder exportieren Sie zuerst die Kopie dieser Seite.",
  archiveNoteHistoryReleased: "Der Speicher ist fast voll, daher werden ältere Rückgängig-Schritte nicht gespeichert. Das Material ist gespeichert; in diesem Tab lassen sie sich bis zum Schließen noch rückgängig machen.",
  archiveNoteHistoryUnavailable: "Einige frühere Änderungen konnten nicht wiederhergestellt werden und lassen sich nicht mehr rückgängig machen. Das Material selbst ist unversehrt.",
  archiveNoteNotPersisted: "Dieser Browser kann lokalen Speicher bei Platzmangel löschen; bewahren Sie daher eine exportierte Kopie auf.",
  archiveNoteSuperseded: "In einem anderen Tab ist eine neuere Version von Matter offen und hat den lokalen Speicher übernommen. Exportieren Sie eine Kopie des Materials dieser Seite und laden Sie dann neu.",
  archiveNoteUnavailable: "Dieser Browser speichert kein Matter-Material, zum Beispiel in einem privaten Fenster. Exportieren Sie eine Kopie, um es zu behalten.",
  archiveNoteUpgradeBlocked: "Matter aktualisiert den lokalen Speicher. Schließen Sie andere Matter-Tabs, damit das Update abgeschlossen werden kann.",
  archiveReloadPage: "Neu laden",
  durabilityCleared: "Lokaler Speicher wurde gelöscht",
  durabilityDiverged: "Diese Seite und das gespeicherte Material weichen ab",
  durabilityNewerCopy: "In einem anderen Tab ist eine neuere Kopie offen",
  durabilityNewerMatter: "In einem anderen Tab ist ein neueres Matter offen",
  durabilityNotSaved: "Nicht auf diesem Gerät gespeichert",
  durabilityNotSaving: "In diesem Browser wird nicht gespeichert",
  durabilityUpgradeBlocked: "Schließen Sie andere Matter-Tabs, um das Update abzuschließen",
  archiveKeepCurrent: "Aktuelles Material behalten",
  archiveReplace: "Ersetzen",
  canvasTitle: "Canvas-Titel",
  close: "Schließen",
  closeSearch: "Suche schließen",
  copied: "Kopiert",
  copy: "Kopieren",
  copySelectedThoughts: (count) =>
    `${count} ${counted(GERMAN_PLURAL, count, "ausgewählten Gedanken", "ausgewählte Gedanken")} kopieren`,
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
  historyReleased: "Ältere Rückgängig-Schritte bleiben nach dem Neuladen nicht erhalten",
  historyUnavailable: "Frühere Änderungen lassen sich nicht mehr rückgängig machen",
  includeWhenCopying: (title) => `${title} beim Kopieren einbeziehen`,
  identityName: "Steinbrecher",
  localOnly: "Nur auf diesem Gerät",
  materialFiles: "Materialdateien",
  materialTree: (count) =>
    `Markdown-Materialbaum, ${count} ${counted(GERMAN_PLURAL, count, "Eintrag", "Einträge")}`,
  nameFor: (title) => `Name für ${title}`,
  nameNotSaved: "Dieser Name wurde nicht gespeichert. Mit der Eingabetaste erneut versuchen.",
  renameCanvas: (title) => `Canvas umbenennen: ${title}`,
  renameCanvasTitle: "Canvas umbenennen",
  revisionCount: (count) =>
    `${count} ${counted(GERMAN_PLURAL, count, "Änderung", "Änderungen")} gespeichert`,
  // "Treffer" is the same word in the singular and the plural.
  resultCount: (count) => `${count} Materialtreffer`,
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
