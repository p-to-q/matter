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
import {
  DEFAULT_WIKI_CAPABILITY_PREFERENCES,
} from "../persistence/wiki-capability-preferences";
import { matterWikiCapabilityPreferences } from
  "../persistence/wiki-capability-preferences-controller";
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

// The loader resolves copy before this component becomes renderable.
let readCopy: typeof import("./wiki-settings-copy").wikiSettingsCopy;
export async function loadWikiSettingsSection() {
  readCopy = (await import("./wiki-settings-copy")).wikiSettingsCopy;
  return WikiSettingsSection;
}

export function WikiSettingsSection({
  active,
  focusTerm = null,
  language,
}: Readonly<{
  active: boolean;
  /** One canonical term an error-local takeover asked to show; each request once. */
  focusTerm?: Readonly<{ canonical: string; locale: CanvasLanguage; requestId: number }> | null;
  language: CanvasLanguage;
}>) {
  const copy = readCopy(language);
  const snapshot = useSyncExternalStore(
    matterWikiConfiguration.subscribe,
    matterWikiConfiguration.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const capabilityPreferences = useSyncExternalStore(
    matterWikiCapabilityPreferences.subscribe,
    matterWikiCapabilityPreferences.getSnapshot,
    () => DEFAULT_WIKI_CAPABILITY_PREFERENCES,
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
  const handledFocusRequestRef = useRef<number | null>(null);
  const focusTargetRef = useRef<Readonly<{ requestId: number; ruleId: string }> | null>(null);

  useEffect(() => {
    if (active) void matterWikiConfiguration.start();
  }, [active]);

  useEffect(() => {
    if (!active || focusTerm === null || snapshot.stateRevision === null) return;
    if (handledFocusRequestRef.current !== focusTerm.requestId) {
      handledFocusRequestRef.current = focusTerm.requestId;
      const matches = snapshot.rules.filter((rule) => rule.canonical === focusTerm.canonical);
      const rule = matches.find((entry) => entry.locale === focusTerm.locale) ?? matches[0];
      setEditor(null);
      setRemoveRule(null);
      setFilter("all");
      setVisibleCount(LOAD_STEP);
      setQuery(focusTerm.canonical);
      focusTargetRef.current = rule === undefined
        ? null
        : Object.freeze({ requestId: focusTerm.requestId, ruleId: rule.id });
    }
    const target = focusTargetRef.current;
    if (target === null || target.requestId !== focusTerm.requestId) return;
    // The dialog focuses its first control on open; the term takes focus once
    // the filtered list has rendered it. A cancelled attempt is retried by the
    // next run until it lands.
    let attempts = 0;
    let frame = window.requestAnimationFrame(function focusRule() {
      const button = ruleButtonRefs.current.get(target.ruleId);
      if (button !== undefined) {
        focusTargetRef.current = null;
        button.focus({ preventScroll: true });
        button.scrollIntoView({ block: "nearest" });
        return;
      }
      attempts += 1;
      if (attempts < 12) frame = window.requestAnimationFrame(focusRule);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, focusTerm, snapshot.rules, snapshot.stateRevision]);

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

  const toggleAutomaticCollection = () => {
    const result = matterWikiCapabilityPreferences.setAutomaticCollection(
      !capabilityPreferences.automaticCollection,
    );
    if (!result.ok) showNotice(copy.failed);
  };

  const togglePhoneticFitting = () => {
    const result = matterWikiCapabilityPreferences.setPhoneticFitting(
      !capabilityPreferences.phoneticFitting,
    );
    if (!result.ok) showNotice(copy.failed);
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
      {snapshot.status.phase === "loading" ? <p className={styles.state}>{copy.loading}</p> : null}
      {degraded ? (
        <div className={styles.state}>
          <span>{corrupt ? copy.damaged : snapshot.status.phase === "degraded" &&
            snapshot.status.reason === "superseded" ? copy.superseded : copy.unavailable}</span>
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
            <div className={styles.headerActions}>
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
            </div>
          </div>

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
                    className={styles.mapping}
                    onClick={() => beginEdit(rule)}
                    ref={(node) => {
                      if (node === null) ruleButtonRefs.current.delete(rule.id);
                      else ruleButtonRefs.current.set(rule.id, node);
                    }}
                    type="button"
                  >
                    <span lang={rule.locale}>{rule.canonical}</span>
                    <span className={styles.visuallyHidden}>
                      {` · ${rule.origin === "automatic" ? copy.automatic : copy.manual}`}
                    </span>
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

          <footer className={styles.listFooter}>
            <div className={styles.footerSummary}>
              <p>{copy.footerNote}</p>
              <span className={styles.total}>{copy.total(filtered.length)}</span>
            </div>
            <div className={styles.capabilityActions}>
              <button
                onClick={toggleAutomaticCollection}
                type="button"
              >
                {capabilityPreferences.automaticCollection
                  ? copy.disableAutomaticCollection
                  : copy.enableAutomaticCollection}
              </button>
              <button
                onClick={togglePhoneticFitting}
                type="button"
              >
                {capabilityPreferences.phoneticFitting
                  ? copy.disablePhoneticFitting
                  : copy.enablePhoneticFitting}
              </button>
            </div>
          </footer>
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
