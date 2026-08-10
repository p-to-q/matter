import type { StoredInquiryExchange, StoredInquiryRecord } from "../persistence/inquiry-record-repository";
import {
  appendInquiryExchange,
  type InquiryRecordDraft,
  type InquiryRecordVersion,
  inquiryRecordVersion,
} from "../persistence/inquiry-record-policy";

export type AppendReconciliation =
  | Readonly<{ kind: "retry"; draft: InquiryRecordDraft; version: InquiryRecordVersion }>
  | Readonly<{ kind: "discarded-after-clear"; record: StoredInquiryRecord | null }>;

/**
 * A CAS conflict is recoverable only within the same clear epoch. A new epoch
 * is proof that this terminal answer belonged to an inquiry cleared elsewhere,
 * so retrying it would resurrect deliberately removed history.
 */
export function reconcileInquiryAppend(
  record: StoredInquiryRecord | null,
  attemptedVersion: InquiryRecordVersion,
  exchange: StoredInquiryExchange,
): AppendReconciliation {
  const version = inquiryRecordVersion(record);
  if (version.epoch !== attemptedVersion.epoch) {
    return Object.freeze({ kind: "discarded-after-clear", record });
  }
  const exchanges = appendInquiryExchange(record?.exchanges ?? [], exchange);
  if (exchanges === null) return Object.freeze({ kind: "discarded-after-clear", record });
  return Object.freeze({
    kind: "retry",
    version,
    draft: Object.freeze({ recordSchemaVersion: 1, treeId: exchange.basis.treeId, exchanges }),
  });
}

export function reconcileInquiryClear(record: StoredInquiryRecord | null):
  | Readonly<{ kind: "retry"; version: InquiryRecordVersion }>
  | Readonly<{ kind: "already-cleared"; version: InquiryRecordVersion }> {
  const version = inquiryRecordVersion(record);
  return record?.cleared === true
    ? Object.freeze({ kind: "already-cleared", version })
    : Object.freeze({ kind: "retry", version });
}
