"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { CanvasLanguage } from "./canvas-preferences";
import {
  MAX_USER_PROVIDER_API_KEY_CODE_UNITS,
  MAX_USER_PROVIDER_ENDPOINT_CODE_UNITS,
  MIN_USER_PROVIDER_API_KEY_CODE_UNITS,
  isValidUserProviderApiKey,
  normalizeUserProviderEndpoint,
  type ProviderSessionStatus,
} from "../protocol/provider-session-contract";
import {
  ProviderSessionClientError,
  readProviderSession,
  removeUserProvider,
  saveUserProvider,
  testUserProvider,
} from "../interaction/provider-session-client";
import styles from "./CanvasChrome.module.css";

type ApiSettingsCopy = Readonly<{
  endpoint: string;
  endpointPlaceholder: string;
  endpointInvalid: string;
  apiKey: string;
  apiKeyInvalid: string;
  apiKeyRequiredForNewAddress: string;
  keyPlaceholder: string;
  savedKeyHint: string;
  save: string;
  saving: string;
  test: string;
  testing: string;
  remove: string;
  cancelRemove: string;
  confirmRemove: string;
  removing: string;
  savedState: string;
  existingSavedState: string;
  saved: string;
  tested: string;
  removed: string;
  unavailable: string;
  busy: string;
  failed: string;
  statusFailed: string;
  privacy: string;
}>;

type ApiSettingsNotice = Readonly<{
  kind: "status" | "error";
  code: "saved" | "tested" | "removed" | "unavailable" | "busy" | "failed" | "statusFailed";
}>;

type ApiSettingsFieldErrors = Readonly<{
  endpoint?: string;
  apiKey?: string;
}>;

type ApiSettingsOperation = "refresh" | "test" | "save" | "remove";

const ENDPOINT_PLACEHOLDER = "https://api.kfc.com/v1";
const KEY_PLACEHOLDER = "sk-kfcfkxqsvivowushiwoyaochishunzhiyuanweiji";

export const API_SETTINGS_COPY: Readonly<Record<CanvasLanguage, ApiSettingsCopy>> = Object.freeze({
  "en-US": Object.freeze({
    endpoint: "API address",
    endpointPlaceholder: ENDPOINT_PLACEHOLDER,
    endpointInvalid: "Enter a public HTTPS API address.",
    apiKey: "API key",
    apiKeyInvalid: "Enter the complete API key without spaces around it.",
    apiKeyRequiredForNewAddress: "Enter the key for this new address.",
    keyPlaceholder: KEY_PLACEHOLDER,
    savedKeyHint: "A key is saved. Leave this empty to keep it.",
    save: "Save",
    saving: "Saving…",
    test: "Test",
    testing: "Testing…",
    remove: "Remove",
    cancelRemove: "Cancel",
    confirmRemove: "Confirm remove",
    removing: "Removing…",
    savedState: "Saved on this browser",
    existingSavedState: "A previous setting is still saved",
    saved: "Saved and ready.",
    tested: "Connection works.",
    removed: "Saved access removed.",
    unavailable: "Saving Model API access is unavailable here.",
    busy: "Matter is busy. Try again shortly.",
    failed: "Could not connect. Check the address and key.",
    statusFailed: "Could not read the saved setting. You can still edit it.",
    privacy: "The key is kept as an encrypted browser credential for 30 days. Model features send the relevant content to this address.",
  }),
  "zh-CN": Object.freeze({
    endpoint: "API 地址",
    endpointPlaceholder: ENDPOINT_PLACEHOLDER,
    endpointInvalid: "请输入公开可访问的 HTTPS API 地址。",
    apiKey: "API Key",
    apiKeyInvalid: "请输入完整的 API Key，前后不要留空格。",
    apiKeyRequiredForNewAddress: "地址已更改，请输入这个地址的 Key。",
    keyPlaceholder: KEY_PLACEHOLDER,
    savedKeyHint: "Key 已保存；留空即保持不变。",
    save: "保存",
    saving: "保存中…",
    test: "测试",
    testing: "测试中…",
    remove: "移除",
    cancelRemove: "取消",
    confirmRemove: "确认移除",
    removing: "移除中…",
    savedState: "已保存在此浏览器",
    existingSavedState: "此前的设置仍已保存",
    saved: "已保存并可用。",
    tested: "连接可用。",
    removed: "已移除保存的访问。",
    unavailable: "此处暂时无法保存模型 API。",
    busy: "Matter 暂时繁忙，请稍后重试。",
    failed: "无法连接，请检查地址与 Key。",
    statusFailed: "暂时无法读取已保存设置，仍可继续编辑。",
    privacy: "Key 以加密凭据在此浏览器保留 30 天；使用模型功能时，相应内容会发往上述地址。",
  }),
  "zh-TW": Object.freeze({
    endpoint: "API 位址",
    endpointPlaceholder: ENDPOINT_PLACEHOLDER,
    endpointInvalid: "請輸入公開可存取的 HTTPS API 位址。",
    apiKey: "API Key",
    apiKeyInvalid: "請輸入完整的 API Key，前後不要留空格。",
    apiKeyRequiredForNewAddress: "位址已變更，請輸入這個位址的 Key。",
    keyPlaceholder: KEY_PLACEHOLDER,
    savedKeyHint: "Key 已儲存；留空即保持不變。",
    save: "儲存",
    saving: "儲存中…",
    test: "測試",
    testing: "測試中…",
    remove: "移除",
    cancelRemove: "取消",
    confirmRemove: "確認移除",
    removing: "移除中…",
    savedState: "已儲存在此瀏覽器",
    existingSavedState: "先前的設定仍已儲存",
    saved: "已儲存並可使用。",
    tested: "連線可用。",
    removed: "已移除儲存的存取。",
    unavailable: "此處暫時無法儲存模型 API。",
    busy: "Matter 暫時忙碌，請稍後再試。",
    failed: "無法連線，請檢查位址與 Key。",
    statusFailed: "暫時無法讀取已儲存設定，仍可繼續編輯。",
    privacy: "Key 會以加密憑據在此瀏覽器保留 30 天；使用模型功能時，相應內容會傳往上述位址。",
  }),
  "ja-JP": Object.freeze({
    endpoint: "API アドレス",
    endpointPlaceholder: ENDPOINT_PLACEHOLDER,
    endpointInvalid: "公開アクセス可能な HTTPS API アドレスを入力してください。",
    apiKey: "API キー",
    apiKeyInvalid: "前後に空白を入れず、完全な API キーを入力してください。",
    apiKeyRequiredForNewAddress: "新しいアドレスのキーを入力してください。",
    keyPlaceholder: KEY_PLACEHOLDER,
    savedKeyHint: "キーは保存済みです。空欄のままなら変更しません。",
    save: "保存",
    saving: "保存中…",
    test: "接続をテスト",
    testing: "テスト中…",
    remove: "削除",
    cancelRemove: "キャンセル",
    confirmRemove: "削除を確認",
    removing: "削除中…",
    savedState: "このブラウザに保存済み",
    existingSavedState: "以前の設定は保存されたままです",
    saved: "保存して利用可能になりました。",
    tested: "接続できます。",
    removed: "保存したアクセスを削除しました。",
    unavailable: "ここではモデル API を保存できません。",
    busy: "Matter は現在混み合っています。少し待ってから再試行してください。",
    failed: "接続できません。アドレスとキーを確認してください。",
    statusFailed: "保存済み設定を読み取れませんでした。編集は続けられます。",
    privacy: "キーは暗号化されたブラウザ資格情報として30日間保持されます。モデル機能を使うと、該当する内容がこのアドレスへ送られます。",
  }),
  "de-DE": Object.freeze({
    endpoint: "API-Adresse",
    endpointPlaceholder: ENDPOINT_PLACEHOLDER,
    endpointInvalid: "Gib eine öffentlich erreichbare HTTPS-API-Adresse ein.",
    apiKey: "API-Schlüssel",
    apiKeyInvalid: "Gib den vollständigen API-Schlüssel ohne äußere Leerzeichen ein.",
    apiKeyRequiredForNewAddress: "Gib den Schlüssel für diese neue Adresse ein.",
    keyPlaceholder: KEY_PLACEHOLDER,
    savedKeyHint: "Ein Schlüssel ist gespeichert. Leer lassen, um ihn beizubehalten.",
    save: "Speichern",
    saving: "Speichern …",
    test: "Verbindung testen",
    testing: "Test läuft …",
    remove: "Entfernen",
    cancelRemove: "Abbrechen",
    confirmRemove: "Entfernen bestätigen",
    removing: "Wird entfernt …",
    savedState: "In diesem Browser gespeichert",
    existingSavedState: "Eine frühere Einstellung bleibt gespeichert",
    saved: "Gespeichert und einsatzbereit.",
    tested: "Verbindung funktioniert.",
    removed: "Gespeicherten Zugriff entfernt.",
    unavailable: "Der Modell-API-Zugriff kann hier nicht gespeichert werden.",
    busy: "Matter ist gerade ausgelastet. Bitte versuche es gleich erneut.",
    failed: "Keine Verbindung. Prüfe Adresse und Schlüssel.",
    statusFailed: "Die gespeicherte Einstellung konnte nicht gelesen werden. Du kannst sie weiter bearbeiten.",
    privacy: "Der Schlüssel bleibt 30 Tage als verschlüsselter Browser-Nachweis gespeichert. Modellfunktionen senden die jeweiligen Inhalte an diese Adresse.",
  }),
});

export function ApiSettingsForm({
  language,
  presented,
}: Readonly<{
  language: CanvasLanguage;
  presented: boolean;
}>) {
  const copy = API_SETTINGS_COPY[language];
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<ProviderSessionStatus | null>(null);
  const [busy, setBusy] = useState<ApiSettingsOperation | null>(null);
  const [notice, setNotice] = useState<ApiSettingsNotice | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiSettingsFieldErrors>({});
  const [removeArmed, setRemoveArmed] = useState(false);
  const operationRef = useRef<AbortController | null>(null);
  const operationKindRef = useRef<ApiSettingsOperation | null>(null);
  const endpointTouchedRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const focusEndpointAfterRemoveRef = useRef(false);
  const presentedRef = useRef(false);
  const endpointInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();

  const beginOperation = useCallback((kind: ApiSettingsOperation): AbortController | null => {
    // An accepted mutation owns its lifetime. A second click, key repeat, or
    // presentation change must not cancel the action the person already made.
    if (operationKindRef.current !== null) {
      if (operationKindRef.current !== "refresh" || kind === "refresh") return null;
      // A person's explicit action may supersede the incidental status read.
      operationRef.current?.abort();
      operationRef.current = null;
      operationKindRef.current = null;
    }
    const operation = new AbortController();
    operationRef.current = operation;
    operationKindRef.current = kind;
    setBusy(kind);
    if (kind === "refresh") setRemoveArmed(false);
    else setNotice(null);
    return operation;
  }, []);

  const finishOperation = useCallback((operation: AbortController) => {
    if (operationRef.current !== operation) return;
    operationRef.current = null;
    operationKindRef.current = null;
    setBusy(null);
  }, []);

  const refreshStatus = useCallback(() => {
    const operation = beginOperation("refresh");
    if (operation === null) return;
    void readProviderSession(operation.signal).then((next) => {
      if (operation.signal.aborted) return;
      setStatus(next);
      if (next.credentialPresent && next.endpoint !== null && !endpointTouchedRef.current) {
        setEndpoint(next.endpoint);
      }
      setNotice((current) => {
        if (!next.available) return { kind: "status", code: "unavailable" };
        return current?.code === "statusFailed" || current?.code === "unavailable" ? null : current;
      });
    }).catch((error: unknown) => {
      if (!operation.signal.aborted) {
        setNotice({ kind: "error", code: clientNoticeCode(error, true) });
      }
    }).finally(() => finishOperation(operation));
  }, [beginOperation, finishOperation]);

  useEffect(() => {
    const opening = presented && !presentedRef.current;
    presentedRef.current = presented;
    if (opening) refreshStatus();
  }, [presented, refreshStatus]);

  useEffect(() => {
    if (!presented || busy !== null || !focusEndpointAfterRemoveRef.current) return;
    focusEndpointAfterRemoveRef.current = false;
    endpointInputRef.current?.focus({ preventScroll: true });
  }, [busy, presented]);

  useEffect(() => {
    const onPageHide = () => {
      operationRef.current?.abort();
      draftRevisionRef.current += 1;
      setApiKey("");
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      operationRef.current?.abort();
      operationRef.current = null;
      operationKindRef.current = null;
    };
  }, []);

  const normalizedEndpoint = normalizeUserProviderEndpoint(endpoint);
  const canReuseSavedKey = status?.credentialPresent === true &&
    normalizedEndpoint !== null && normalizedEndpoint === status.endpoint;
  const draftMatchesSaved = canReuseSavedKey && apiKey.length === 0;
  const mutationBusy = busy === "test" || busy === "save" || busy === "remove";
  const actionsAvailable = status?.available !== false;

  const validateMutation = (): Readonly<{ endpoint: string; apiKey?: string }> | null => {
    const nextErrors: ApiSettingsFieldErrors = {
      ...(normalizedEndpoint === null ? { endpoint: copy.endpointInvalid } : {}),
      ...(apiKey.length > 0 && !isValidUserProviderApiKey(apiKey)
        ? { apiKey: copy.apiKeyInvalid }
        : {}),
      ...(apiKey.length === 0 && !canReuseSavedKey
        ? { apiKey: copy.apiKeyRequiredForNewAddress }
        : {}),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.endpoint !== undefined) {
      endpointInputRef.current?.focus({ preventScroll: true });
      return null;
    }
    if (nextErrors.apiKey !== undefined || normalizedEndpoint === null) {
      keyInputRef.current?.focus({ preventScroll: true });
      return null;
    }
    return Object.freeze({
      endpoint: normalizedEndpoint,
      ...(apiKey.length === 0 ? {} : { apiKey }),
    });
  };

  const test = () => {
    if (
      (operationKindRef.current !== null && operationKindRef.current !== "refresh") ||
      !actionsAvailable
    ) return;
    const input = validateMutation();
    if (input === null) return;
    const submittedRevision = draftRevisionRef.current;
    const operation = beginOperation("test");
    if (operation === null) return;
    void testUserProvider({ ...input, signal: operation.signal }).then(() => {
      if (!operation.signal.aborted && draftRevisionRef.current === submittedRevision) {
        setNotice({ kind: "status", code: "tested" });
      }
    }).catch((error: unknown) => {
      if (!operation.signal.aborted && draftRevisionRef.current === submittedRevision) {
        setNotice({ kind: "error", code: clientNoticeCode(error) });
      }
    }).finally(() => finishOperation(operation));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      (operationKindRef.current !== null && operationKindRef.current !== "refresh") ||
      !actionsAvailable
    ) return;
    const input = validateMutation();
    if (input === null) return;
    const submittedRevision = draftRevisionRef.current;
    const operation = beginOperation("save");
    if (operation === null) return;
    void saveUserProvider({ ...input, signal: operation.signal }).then((next) => {
      if (operation.signal.aborted) return;
      setStatus(next);
      if (draftRevisionRef.current === submittedRevision) {
        setEndpoint(next.endpoint ?? input.endpoint);
        setApiKey("");
        endpointTouchedRef.current = false;
        setFieldErrors({});
        setNotice({ kind: "status", code: "saved" });
      } else {
        setNotice(null);
      }
      setRemoveArmed(false);
    }).catch((error: unknown) => {
      if (!operation.signal.aborted && draftRevisionRef.current === submittedRevision) {
        setNotice({ kind: "error", code: clientNoticeCode(error) });
      }
    }).finally(() => finishOperation(operation));
  };

  const remove = () => {
    if (operationKindRef.current !== null || status?.credentialPresent !== true) return;
    const operation = beginOperation("remove");
    if (operation === null) return;
    void removeUserProvider(operation.signal).then((next) => {
      if (operation.signal.aborted) return;
      setStatus(next);
      setApiKey("");
      setFieldErrors({});
      setRemoveArmed(false);
      endpointTouchedRef.current = endpoint.length > 0;
      focusEndpointAfterRemoveRef.current = true;
      setNotice({ kind: "status", code: "removed" });
    }).catch((error: unknown) => {
      if (!operation.signal.aborted) setNotice({ kind: "error", code: clientNoticeCode(error) });
    }).finally(() => finishOperation(operation));
  };

  if (!presented) return null;

  const endpointErrorId = `${descriptionId}-endpoint-error`;
  const keyErrorId = `${descriptionId}-key-error`;
  const savedKeyHintId = `${descriptionId}-saved-key`;
  const visibleNotice = status?.available === false
    ? { kind: "status" as const, code: "unavailable" as const }
    : notice ?? (
      status?.credentialPresent === true
        ? {
            kind: "status" as const,
            code: draftMatchesSaved ? "savedState" as const : "existingSavedState" as const,
          }
        : null
    );

  return (
    <form
      aria-busy={mutationBusy}
      aria-describedby={descriptionId}
      className={styles.apiForm}
      noValidate
      onSubmit={submit}
    >
      <div className={styles.apiField}>
        <label htmlFor={`${descriptionId}-endpoint`}>{copy.endpoint}</label>
        <input
          aria-describedby={fieldErrors.endpoint === undefined ? undefined : endpointErrorId}
          aria-invalid={fieldErrors.endpoint === undefined ? undefined : true}
          autoCapitalize="none"
          autoComplete="url"
          id={`${descriptionId}-endpoint`}
          inputMode="url"
          maxLength={MAX_USER_PROVIDER_ENDPOINT_CODE_UNITS}
          name="endpoint"
          onChange={(event) => {
            endpointTouchedRef.current = true;
            draftRevisionRef.current += 1;
            setRemoveArmed(false);
            setEndpoint(event.currentTarget.value);
            if (fieldErrors.endpoint !== undefined) {
              setFieldErrors((current) => {
                const { endpoint: ignored, ...remaining } = current;
                void ignored;
                return remaining;
              });
            }
            if (notice !== null) setNotice(null);
          }}
          onBlur={() => {
            const canonical = normalizeUserProviderEndpoint(endpoint);
            if (canonical === null || canonical === endpoint) return;
            draftRevisionRef.current += 1;
            setEndpoint(canonical);
          }}
          placeholder={copy.endpointPlaceholder}
          ref={endpointInputRef}
          required
          spellCheck={false}
          type="url"
          value={endpoint}
        />
        {fieldErrors.endpoint === undefined ? null : (
          <p className={styles.apiFieldError} id={endpointErrorId}>{fieldErrors.endpoint}</p>
        )}
      </div>

      <div className={styles.apiField}>
        <label htmlFor={`${descriptionId}-key`}>{copy.apiKey}</label>
        <input
          aria-describedby={[
            canReuseSavedKey ? savedKeyHintId : null,
            fieldErrors.apiKey === undefined ? null : keyErrorId,
          ].filter(Boolean).join(" ") || undefined}
          aria-invalid={fieldErrors.apiKey === undefined ? undefined : true}
          aria-required={!canReuseSavedKey}
          autoCapitalize="none"
          autoComplete="off"
          id={`${descriptionId}-key`}
          maxLength={MAX_USER_PROVIDER_API_KEY_CODE_UNITS}
          minLength={MIN_USER_PROVIDER_API_KEY_CODE_UNITS}
          name="apiKey"
          onChange={(event) => {
            draftRevisionRef.current += 1;
            setRemoveArmed(false);
            setApiKey(event.currentTarget.value);
            if (fieldErrors.apiKey !== undefined) {
              setFieldErrors((current) => {
                const { apiKey: ignored, ...remaining } = current;
                void ignored;
                return remaining;
              });
            }
            if (notice !== null) setNotice(null);
          }}
          placeholder={copy.keyPlaceholder}
          ref={keyInputRef}
          required={!canReuseSavedKey}
          spellCheck={false}
          type="password"
          value={apiKey}
        />
        {canReuseSavedKey && apiKey.length === 0 ? (
          <p className={styles.apiFieldHint} id={savedKeyHintId}>{copy.savedKeyHint}</p>
        ) : null}
        {fieldErrors.apiKey === undefined ? null : (
          <p className={styles.apiFieldError} id={keyErrorId}>{fieldErrors.apiKey}</p>
        )}
      </div>

      {visibleNotice === null ? null : (
        <div className={styles.apiStateRow}>
          <div aria-live="polite" className={styles.apiState}>
            <p role={visibleNotice.kind === "error" ? "alert" : "status"}>
              {copy[visibleNotice.code]}
            </p>
          </div>
          {status?.credentialPresent !== true ? null : (
            <div className={styles.apiRemoveActions}>
              {removeArmed ? (
                <button
                  className={styles.apiRemove}
                  disabled={mutationBusy}
                  onClick={() => setRemoveArmed(false)}
                  type="button"
                >
                  {copy.cancelRemove}
                </button>
              ) : null}
              <button
                className={styles.apiRemove}
                disabled={mutationBusy}
                onClick={removeArmed ? remove : () => setRemoveArmed(true)}
                type="button"
              >
                {busy === "remove"
                  ? copy.removing
                  : removeArmed ? copy.confirmRemove : copy.remove}
              </button>
            </div>
          )}
        </div>
      )}

      <div className={styles.apiFooter}>
        <p className={styles.apiPrivacy} id={descriptionId}>{copy.privacy}</p>
        <div className={styles.apiActions}>
          <button
            className={styles.apiTest}
            disabled={mutationBusy || !actionsAvailable}
            onClick={test}
            type="button"
          >
            {busy === "test" ? copy.testing : copy.test}
          </button>
          <button
            className={styles.apiSave}
            disabled={mutationBusy || !actionsAvailable}
            type="submit"
          >
            {busy === "save" ? copy.saving : copy.save}
          </button>
        </div>
      </div>
    </form>
  );
}

function clientNoticeCode(
  error: unknown,
  readingStatus = false,
): "unavailable" | "busy" | "failed" | "statusFailed" {
  if (error instanceof ProviderSessionClientError && error.code === "FEATURE_UNAVAILABLE") {
    return "unavailable";
  }
  if (error instanceof ProviderSessionClientError && error.code === "RATE_LIMITED") {
    return "busy";
  }
  return readingStatus ? "statusFailed" : "failed";
}
