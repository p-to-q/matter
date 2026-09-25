"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import type { CanvasLanguage } from "./canvas-preferences";
import {
  matterWikiConfiguration,
  type MatterWikiConfigurationSnapshot,
} from "../persistence/wiki-runtime";
import type {
  WikiConfigurationInput,
  WikiConfigurationRule,
} from "../wiki/wiki-configuration";
import {
  MAX_WIKI_CANONICAL_CODE_POINTS,
  type WikiLexemeScope,
} from "../wiki/wiki-model";
import { isWikiCanonical } from "../wiki/wiki-invariants";
import styles from "./WikiSettingsSection.module.css";

const LOAD_STEP = 16;
const SERVER_SNAPSHOT: MatterWikiConfigurationSnapshot = Object.freeze({
  status: Object.freeze({ phase: "loading" }),
  stateRevision: null,
  hasStoredData: false,
  rules: Object.freeze([]),
});

type Editor = Readonly<{
  mode: "add" | "edit";
  before: WikiConfigurationRule | null;
  openedAtRevision: number;
  locale: CanvasLanguage;
  canonical: string;
  scope: WikiLexemeScope;
}>;

type RuleFilter = "all" | "automatic" | "confirmed";

const TRANSIENT_NOTICE_MS = 1_800;
const EXPORT_CONFIRMATION_MS = 900;

type Copy = Readonly<{
  title: string;
  description: string;
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
  back: string;
  newWord: string;
  entry: string;
  addToDictionary: string;
  save: string;
  confirmWriting: string;
  cancel: string;
  edit: string;
  remove: string;
  removeQuestion: string;
  confirm: string;
  loadMore: string;
  loading: string;
  retry: string;
  unavailable: string;
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

export function WikiSettingsSection({
  active,
  language,
}: Readonly<{
  active: boolean;
  language: CanvasLanguage;
}>) {
  const copy = COPY[language];
  const snapshot = useSyncExternalStore(
    matterWikiConfiguration.subscribe,
    matterWikiConfiguration.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [visibleCount, setVisibleCount] = useState(LOAD_STEP);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [exported, setExported] = useState(false);
  const [removeRule, setRemoveRule] = useState<WikiConfigurationRule | null>(null);
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const removeConfirmRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const restoreFocusRuleRef = useRef<string | null>(null);
  const ruleButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (active) void matterWikiConfiguration.start();
  }, [active]);

  useEffect(() => {
    if (removeRule !== null) removeConfirmRef.current?.focus();
  }, [removeRule]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (editor !== null || restoreFocusRuleRef.current === null) return;
    const ruleId = restoreFocusRuleRef.current;
    restoreFocusRuleRef.current = null;
    window.requestAnimationFrame(() => {
      if (ruleId !== "add") {
        const rule = ruleButtonRefs.current.get(ruleId);
        if (rule !== undefined) {
          rule.focus();
          return;
        }
      }
      addButtonRef.current?.focus();
    });
  }, [editor]);

  const showNotice = (message: string, transient = false) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    setExported(false);
    if (!transient) return;
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, TRANSIENT_NOTICE_MS);
  };

  const clearNotice = () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice("");
    setExported(false);
  };

  const deferredQuery = useDeferredValue(query);
  const searchableRules = useMemo(() => snapshot.rules.map((rule) => Object.freeze({
    rule,
    searchKey: rule.canonical.toLocaleLowerCase(rule.locale),
  })), [snapshot.rules]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase(language);
    const byOrigin = filter === "all"
      ? searchableRules
      : searchableRules.filter(({ rule }) => rule.origin === filter);
    if (needle.length === 0) return byOrigin.map(({ rule }) => rule);
    return byOrigin
      .filter(({ searchKey }) => searchKey.includes(needle))
      .map(({ rule }) => rule);
  }, [deferredQuery, filter, language, searchableRules]);
  const visible = filtered.slice(0, visibleCount);
  const normalizedEditor = editor === null ? null : normalizeInput(editor);
  const canSubmit = normalizedEditor !== null && editor !== null && (
    editor.mode === "add" ||
    editor.before?.origin === "automatic" ||
    editor.before?.canonical !== normalizedEditor.canonical ||
    editor.before?.locale !== normalizedEditor.locale ||
    editor.before?.scope !== normalizedEditor.scope
  );

  const beginAdd = () => {
    if (snapshot.stateRevision === null) return;
    clearNotice();
    restoreFocusRuleRef.current = "add";
    setRemoveRule(null);
    setEditor(Object.freeze({
      mode: "add",
      before: null,
      openedAtRevision: snapshot.stateRevision,
      locale: language,
      canonical: "",
      scope: "both",
    }));
  };

  const beginEdit = (rule: WikiConfigurationRule) => {
    if (snapshot.stateRevision === null) return;
    clearNotice();
    restoreFocusRuleRef.current = rule.id;
    setRemoveRule(null);
    setEditor(Object.freeze({
      mode: "edit",
      before: rule,
      openedAtRevision: snapshot.stateRevision,
      locale: rule.locale,
      canonical: rule.canonical,
      scope: rule.scope,
    }));
  };

  const refreshStaleEditor = async (staleEditor: Editor) => {
    await matterWikiConfiguration.retry();
    const fresh = matterWikiConfiguration.getSnapshot();
    const freshRevision = fresh.stateRevision;
    if (freshRevision === null) return;
    setEditor((current) => {
      if (current !== staleEditor) return current;
      const freshBefore = staleEditor.before === null
        ? null
        : fresh.rules.find((rule) => rule.id === staleEditor.before?.id) ?? null;
      return Object.freeze({
        ...staleEditor,
        mode: freshBefore === null ? "add" as const : "edit" as const,
        before: freshBefore,
        openedAtRevision: freshRevision,
      });
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editor === null || pending) return;
    const input = normalizeInput(editor);
    if (input === null) {
      showNotice(copy.invalid);
      return;
    }
    setPending(true);
    const result = editor.mode === "add"
      ? await matterWikiConfiguration.add(input, editor.openedAtRevision)
      : editor.before === null
        ? Object.freeze({ ok: false as const, code: "INVALID_DECISION" as const })
        : await matterWikiConfiguration.replace(
            editor.before,
            input,
            editor.openedAtRevision,
          );
    setPending(false);
    if (!result.ok) {
      showNotice(result.code === "STALE_VIEW"
        ? copy.stale
        : result.code === "INVALID_DECISION"
          ? copy.duplicate
          : result.code === "BOUND_EXCEEDED"
            ? copy.bounded
            : copy.failed);
      if (result.code === "STALE_VIEW") {
        setRemoveRule(null);
        void refreshStaleEditor(editor);
      }
      return;
    }
    restoreFocusRuleRef.current = editor.before?.id ?? "add";
    setEditor(null);
    if (filter === "automatic") setFilter("confirmed");
    showNotice(copy.saved, true);
  };

  const remove = async (rule: WikiConfigurationRule) => {
    if (editor === null || pending) return;
    setPending(true);
    const result = await matterWikiConfiguration.remove(rule, editor.openedAtRevision);
    setPending(false);
    setRemoveRule(null);
    if (result.ok) setEditor(null);
    showNotice(result.ok
      ? copy.saved
      : result.code === "STALE_VIEW" ? copy.stale : copy.failed, result.ok);
    if (!result.ok && result.code === "STALE_VIEW") {
      void refreshStaleEditor(editor);
    }
  };

  const recover = async () => {
    if (pending) return;
    setPending(true);
    const result = await matterWikiConfiguration.resetCorrupt();
    setPending(false);
    setConfirmRecovery(false);
    showNotice(result.ok ? copy.saved : copy.failed, result.ok);
  };

  const exportFile = async () => {
    const result = await matterWikiConfiguration.exportFile();
    if (!result.ok) {
      showNotice(copy.failed);
      return;
    }
    downloadBytes(result.bytes, result.fileName);
    clearNotice();
    setExported(true);
    noticeTimerRef.current = window.setTimeout(() => {
      setExported(false);
      noticeTimerRef.current = null;
    }, EXPORT_CONFIRMATION_MS);
  };

  const closeEditor = () => {
    setEditor(null);
    setRemoveRule(null);
    clearNotice();
  };

  const degraded = snapshot.status.phase === "degraded";
  const corrupt = degraded && snapshot.status.reason === "corrupt";

  return (
    <section aria-busy={pending} aria-label={copy.title} className={styles.section}>
      <header className={styles.header}>
        <div className={styles.introduction}>
          <p>{copy.description}</p>
        </div>
        {editor === null ? <div className={styles.headerActions}>
          <button
            aria-label={exported ? copy.exported : copy.export}
            className={styles.exportButton}
            disabled={snapshot.stateRevision === null}
            onClick={exportFile}
            type="button"
          >
            <span aria-hidden="true" className={styles.exportLabel} data-active={!exported}>
              {copy.export}
            </span>
            <span aria-hidden="true" className={styles.exportLabel} data-active={exported}>
              {copy.exported}
            </span>
          </button>
          <button
            aria-label={copy.add}
            className={styles.addButton}
            disabled={snapshot.stateRevision === null}
            onClick={beginAdd}
            ref={addButtonRef}
            title={copy.add}
            type="button"
          >
            <span aria-hidden="true">＋</span>
          </button>
        </div> : null}
      </header>

      {snapshot.status.phase === "loading" ? <p className={styles.state}>{copy.loading}</p> : null}
      {degraded ? (
        <div className={styles.state}>
          <span>{corrupt ? copy.damaged : copy.unavailable}</span>
          <button disabled={pending} onClick={() => void matterWikiConfiguration.retry()} type="button">
            {copy.retry}
          </button>
          {corrupt && !confirmRecovery ? (
            <button disabled={pending} onClick={() => setConfirmRecovery(true)} type="button">
              {copy.recover}
            </button>
          ) : null}
        </div>
      ) : null}
      {confirmRecovery ? (
        <div className={styles.confirm}>
          <span>{copy.recoverQuestion}</span>
          <button disabled={pending} onClick={recover} type="button">{copy.confirm}</button>
          <button disabled={pending} onClick={() => setConfirmRecovery(false)} type="button">
            {copy.cancel}
          </button>
        </div>
      ) : null}
      <p aria-live="polite" className={styles.notice} data-visible={notice.length > 0}>
        {notice || "\u00a0"}
      </p>
      <span aria-live="polite" className={styles.visuallyHidden}>
        {exported ? copy.exported : ""}
      </span>

      {editor !== null ? (
        <form className={styles.editor} onSubmit={submit}>
          <div className={styles.editorHeading}>
            <button disabled={pending} onClick={closeEditor} type="button">← {copy.back}</button>
            <strong>{editor.mode === "add" ? copy.newWord : copy.entry}</strong>
          </div>
          <label>
            <span>{copy.word}</span>
            <input
              aria-describedby="matter-wiki-editor-hint"
              autoCapitalize="none"
              autoComplete="off"
              autoFocus
              disabled={pending}
              enterKeyHint="done"
              maxLength={MAX_WIKI_CANONICAL_CODE_POINTS * 2}
              onChange={(event) => {
                const canonical = event.currentTarget.value;
                clearNotice();
                setEditor(Object.freeze({
                  ...editor,
                  canonical,
                  locale: inferLexemeLocale(
                    canonical,
                    language,
                    editor.before?.locale ?? editor.locale,
                  ),
                }));
              }}
              spellCheck={false}
              value={editor.canonical}
            />
          </label>
          <label className={styles.scopeField}>
            <span>{copy.scope}</span>
            <span className={styles.scopeControl}>
              <select
                aria-describedby="matter-wiki-editor-hint"
                disabled={pending}
                onChange={(event) => {
                  clearNotice();
                  setEditor(Object.freeze({
                    ...editor,
                    scope: event.currentTarget.value as WikiLexemeScope,
                  }));
                }}
                value={editor.scope}
              >
                <option value="both">{copy.scopeBoth}</option>
                <option value="spoken">{copy.scopeSpoken}</option>
                <option value="written">{copy.scopeWritten}</option>
              </select>
            </span>
          </label>
          <p className={styles.editorHint} id="matter-wiki-editor-hint">
            {copy.editorHint}
          </p>
          <div className={styles.editorFooter}>
            {removeRule !== null && editor.before?.id === removeRule.id ? (
              <div
                aria-label={copy.removeQuestion}
                className={styles.editorRemoveConfirm}
                role="alertdialog"
              >
                <span>{copy.removeQuestion}</span>
                <button
                  disabled={pending}
                  onClick={() => void remove(editor.before!)}
                  ref={removeConfirmRef}
                  type="button"
                >
                  {copy.confirm}
                </button>
                <button disabled={pending} onClick={() => setRemoveRule(null)} type="button">
                  {copy.cancel}
                </button>
              </div>
            ) : (
              <>
                {editor.before === null ? <span /> : (
                  <button
                    className={styles.editorRemove}
                    disabled={pending}
                    onClick={() => setRemoveRule(editor.before)}
                    type="button"
                  >
                    {copy.remove}
                  </button>
                )}
                <div className={styles.editorActions}>
                  <button disabled={pending} onClick={closeEditor} type="button">
                    {copy.cancel}
                  </button>
                  <button disabled={pending || !canSubmit} type="submit">
                    {editor.mode === "add"
                      ? copy.addToDictionary
                      : editor.before?.origin === "automatic" &&
                      editor.canonical.trim() === editor.before.canonical
                        ? copy.confirmWriting
                        : copy.save}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>
      ) : (
        <div className={styles.browser}>
          {snapshot.rules.length > 0 ? (
            <div className={styles.listHeader}>
              <div aria-label={copy.filterLabel} className={styles.filters} role="group">
                {(["all", "automatic", "confirmed"] as const).map((value) => (
                  <button
                    aria-pressed={filter === value}
                    key={value}
                    onClick={() => {
                      setFilter(value);
                      setVisibleCount(LOAD_STEP);
                    }}
                    type="button"
                  >
                    {value === "all" ? copy.all : value === "automatic" ? copy.automatic : copy.manual}
                  </button>
                ))}
              </div>
              <span className={styles.total}>{copy.total(filtered.length)}</span>
            </div>
          ) : null}

          {snapshot.rules.length > 6 || query.length > 0 ? (
            <label className={styles.search}>
              <span className={styles.visuallyHidden}>{copy.search}</span>
              <input
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setVisibleCount(LOAD_STEP);
                }}
                placeholder={copy.search}
                type="search"
                value={query}
              />
            </label>
          ) : null}

          {snapshot.stateRevision === null ? null : snapshot.rules.length === 0 ? (
            <div className={styles.empty}>
              <p>{copy.empty}</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>{copy.noResults(deferredQuery.trim())}</p>
          ) : (
            <ol className={styles.rules}>
              {visible.map((rule) => (
                <li data-origin={rule.origin} key={rule.id}>
                  <button
                    aria-label={`${rule.canonical} · ${rule.origin === "automatic" ? copy.automatic : copy.manual}`}
                    className={styles.mapping}
                    onClick={() => beginEdit(rule)}
                    ref={(node) => {
                      if (node === null) ruleButtonRefs.current.delete(rule.id);
                      else ruleButtonRefs.current.set(rule.id, node);
                    }}
                    type="button"
                  >
                    <span lang={rule.locale}>{rule.canonical}</span>
                  </button>
                  <div className={styles.tileActions}>
                    <button
                      aria-label={`${copy.edit}: ${rule.canonical}`}
                      onClick={() => beginEdit(rule)}
                      title={copy.edit}
                      type="button"
                    >
                      <EditIcon />
                    </button>
                    <button
                      aria-label={`${copy.remove}: ${rule.canonical}`}
                      onClick={() => {
                        beginEdit(rule);
                        setRemoveRule(rule);
                      }}
                      title={copy.remove}
                      type="button"
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {visible.length < filtered.length ? (
            <button
              className={styles.loadMore}
              onClick={() => setVisibleCount((value) => value + LOAD_STEP)}
              type="button"
            >
              {copy.loadMore} · {copy.count(visible.length, filtered.length)}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m3 11.75.8-3.1 6.15-6.15 3.55 3.55-6.15 6.15-3.1.8L3 11.75Zm5.95-8.2 3.5 3.5" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3.5 4.5h9M6 4.5V3h4v1.5m1.25 0-.5 8.5h-5.5l-.5-8.5M6.75 7v3.5M9.25 7v3.5" />
    </svg>
  );
}

function normalizeInput(editor: Editor): WikiConfigurationInput | null {
  const canonical = editor.canonical.trim().normalize("NFC");
  if (!isWikiCanonical(canonical)) return null;
  return Object.freeze({
    locale: editor.locale,
    canonical,
    scope: editor.scope,
  });
}

function inferLexemeLocale(
  value: string,
  interfaceLocale: CanvasLanguage,
  fallback: CanvasLanguage,
): CanvasLanguage {
  const normalized = value.trim().normalize("NFC");
  if (normalized.length === 0) return fallback;
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(normalized)) return "ja-JP";
  if (/\p{Script=Han}/u.test(normalized)) {
    if (interfaceLocale === "zh-TW" || interfaceLocale === "ja-JP") return interfaceLocale;
    return fallback === "zh-TW" || fallback === "ja-JP" ? fallback : "zh-CN";
  }
  if (/\p{Script=Latin}/u.test(normalized)) {
    if (interfaceLocale === "de-DE" || interfaceLocale === "en-US") return interfaceLocale;
    return fallback === "de-DE" || fallback === "en-US" ? fallback : "en-US";
  }
  return fallback;
}

function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const ENGLISH: Copy = Object.freeze({
  title: "WIKI",
  description: "Keep the preferred spelling of important names and terms on this device. This version does not send Wiki contents to a model.",
  filterLabel: "Word source",
  add: "Add word",
  export: "Export dictionary",
  search: "Search words",
  all: "All",
  automatic: "Automatically found",
  manual: "Confirmed",
  empty: "Keep a name or term here when its exact spelling matters.",
  noResults: (query) => query.length > 0 ? `No result for “${query}”.` : "No words in this view.",
  word: "Word or name",
  editorHint: "Choose where this spelling applies. New entries do not rewrite existing material.",
  scope: "Use for",
  scopeBoth: "All text",
  scopeSpoken: "Voice input",
  scopeWritten: "Generated text",
  back: "Back",
  newWord: "Add word",
  entry: "Word",
  addToDictionary: "Add to dictionary",
  save: "Save",
  confirmWriting: "Confirm spelling",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Remove",
  removeQuestion: "Remove?",
  confirm: "Confirm",
  loadMore: "Load more",
  loading: "Loading local words…",
  retry: "Retry",
  unavailable: "Local words are temporarily unavailable.",
  damaged: "The saved Wiki is damaged.",
  recover: "Recover",
  recoverQuestion: "Replace the damaged data with an empty Wiki?",
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

const SIMPLIFIED_CHINESE: Copy = Object.freeze({
  ...ENGLISH,
  title: "词典 WIKI",
  description: "在这里保留重要名字和术语的标准写法。当前版本不会把词典内容发送给模型。",
  filterLabel: "词条来源",
  add: "添加词",
  export: "导出词典",
  search: "搜索词语或名称",
  all: "全部",
  automatic: "自动收录",
  manual: "人工确认",
  empty: "对写法有要求的名字和术语，可以先留在这里。",
  noResults: (query) => query.length > 0 ? `没有找到“${query}”。` : "这里还没有词。",
  word: "词语或名称",
  editorHint: "选择这个写法会用于哪些文字。新加入的词不会改写已有材料。",
  scope: "用于",
  scopeBoth: "所有文字",
  scopeSpoken: "语音输入",
  scopeWritten: "生成内容",
  back: "返回",
  newWord: "添加词",
  entry: "词条",
  addToDictionary: "加入词典",
  save: "保存",
  confirmWriting: "确认这个写法",
  cancel: "取消",
  edit: "修改",
  remove: "移出词典",
  removeQuestion: "从词典中移除这个词？",
  confirm: "确认",
  loadMore: "加载更多",
  loading: "正在读取本地词典…",
  retry: "重试",
  unavailable: "本地词典暂时不可用。",
  damaged: "保存的词典已损坏。",
  recover: "恢复",
  recoverQuestion: "用空白词典替换损坏的数据？",
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

const TRADITIONAL_CHINESE: Copy = Object.freeze({
  ...SIMPLIFIED_CHINESE,
  title: "詞典 WIKI",
  description: "在這裡保留重要名字和術語的標準寫法。目前版本不會把詞典內容傳送給模型。",
  add: "新增詞",
  export: "匯出詞典",
  search: "搜尋詞典",
  all: "全部",
  automatic: "自動收錄",
  manual: "人工確認",
  empty: "對寫法有要求的名字和術語，可以先留在這裡。",
  noResults: (query) => query.length > 0 ? `找不到「${query}」。` : "這裡還沒有詞。",
  word: "詞語或名稱",
  editorHint: "選擇這個寫法會用於哪些文字。新加入的詞不會改寫既有材料。",
  scope: "用於",
  scopeBoth: "所有文字",
  scopeSpoken: "語音輸入",
  scopeWritten: "生成內容",
  back: "返回",
  newWord: "新增詞",
  entry: "詞條",
  addToDictionary: "加入詞典",
  save: "儲存",
  confirmWriting: "確認寫法",
  cancel: "取消",
  edit: "修改",
  remove: "移除",
  loadMore: "載入更多",
  loading: "正在載入本機詞典…",
  unavailable: "本機詞典暫時無法使用。",
  damaged: "儲存的詞典已損壞。",
  saved: "已儲存在本機。",
  stale: "詞典已在另一視窗更新，請重新確認這個詞。",
  duplicate: "這個詞已在詞典中，或與另一詞條衝突。",
  bounded: "本機詞典已達安全容量上限。",
  invalid: "請輸入一個有效的詞語或名稱。",
  exported: "下載已開始",
  total: (count) => `${count} 個詞`,
});

const JAPANESE: Copy = Object.freeze({
  ...ENGLISH,
  title: "辞書 WIKI",
  description: "大切な名前や用語の正しい表記を、このデバイスに保存します。現在のバージョンは辞書をモデルに送信しません。",
  add: "新しい語",
  export: "書き出す",
  search: "辞書を検索",
  all: "すべて",
  automatic: "自動収録",
  manual: "確認済み",
  empty: "表記を大切にしたい名前や用語を、ここに残せます。",
  noResults: (query) => query.length > 0 ? `「${query}」は見つかりません。` : "この表示に語はありません。",
  word: "語句または名称",
  editorHint: "この表記を使う文字を選びます。新しい語は既存の素材を書き換えません。",
  scope: "使用先",
  scopeBoth: "すべての文字",
  scopeSpoken: "音声入力",
  scopeWritten: "生成テキスト",
  back: "戻る",
  newWord: "新しい語",
  entry: "語",
  addToDictionary: "辞書に追加",
  save: "保存",
  confirmWriting: "表記を確認",
  cancel: "キャンセル",
  edit: "編集",
  remove: "削除",
  removeQuestion: "削除しますか？",
  confirm: "確認",
  loadMore: "さらに読み込む",
  loading: "ローカル辞書を読み込み中…",
  retry: "再試行",
  unavailable: "ローカル辞書を一時的に利用できません。",
  damaged: "保存した辞書が破損しています。",
  recover: "復旧",
  recoverQuestion: "破損したデータを空の辞書に置き換えますか？",
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

const GERMAN: Copy = Object.freeze({
  ...ENGLISH,
  title: "WÖRTERBUCH WIKI",
  description: "Bewahrt die bevorzugte Schreibweise wichtiger Namen und Begriffe auf diesem Gerät auf. Diese Version sendet das Wiki nicht an ein Modell.",
  add: "Neues Wort",
  export: "Exportieren",
  search: "Wörter suchen",
  all: "Alle",
  automatic: "Automatisch erfasst",
  manual: "Bestätigt",
  empty: "Bewahren Sie hier Namen und Begriffe auf, deren genaue Schreibweise wichtig ist.",
  noResults: (query) => query.length > 0 ? `Kein Ergebnis für „${query}“.` : "Keine Wörter in dieser Ansicht.",
  word: "Wort oder Name",
  editorHint: "Wählen Sie, wo diese Schreibweise gilt. Neue Wörter ändern bestehendes Material nicht.",
  scope: "Verwenden für",
  scopeBoth: "Alle Texte",
  scopeSpoken: "Spracheingabe",
  scopeWritten: "Generierten Text",
  back: "Zurück",
  newWord: "Neues Wort",
  entry: "Eintrag",
  addToDictionary: "Zum Wörterbuch hinzufügen",
  save: "Speichern",
  confirmWriting: "Schreibweise bestätigen",
  cancel: "Abbrechen",
  edit: "Bearbeiten",
  remove: "Entfernen",
  removeQuestion: "Entfernen?",
  confirm: "Bestätigen",
  loadMore: "Mehr laden",
  loading: "Lokales Wörterbuch wird geladen…",
  retry: "Erneut versuchen",
  unavailable: "Das lokale Wörterbuch ist vorübergehend nicht verfügbar.",
  damaged: "Das gespeicherte Wörterbuch ist beschädigt.",
  recover: "Wiederherstellen",
  recoverQuestion: "Beschädigte Daten durch ein leeres Wörterbuch ersetzen?",
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

const COPY: Readonly<Record<CanvasLanguage, Copy>> = Object.freeze({
  "en-US": ENGLISH,
  "zh-CN": SIMPLIFIED_CHINESE,
  "zh-TW": TRADITIONAL_CHINESE,
  "ja-JP": JAPANESE,
  "de-DE": GERMAN,
});
