import type { RepositoryErrorCode, RepositoryResult } from "./document-repository";
import type { InquiryRecordRepository } from "./inquiry-record-repository";

type RepositoryLoader = () => Promise<InquiryRecordRepository>;

const UNAVAILABLE: RepositoryResult<never> = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "PERSISTENCE_UNAVAILABLE" satisfies RepositoryErrorCode,
    message: "Ask Matter storage is unavailable.",
  }),
});

/**
 * Keeps the Ask Matter record store (its IndexedDB handle and `idb`) out of
 * the first-paint graph. The record loads after hydration and no gesture waits
 * on it: an answer arrives from the network long after the chunk. A chunk that
 * cannot load reads as unavailable storage, the answer the store itself gives
 * when IndexedDB cannot open, and the next operation fetches it again.
 *
 * `close` keeps the store's contract: it releases the open connection, and a
 * later operation opens another (Strict Mode rehearses exactly that).
 */
export function createLazyInquiryRecordRepository(
  load: RepositoryLoader = async () => {
    const repositoryModule = await import("./inquiry-record-repository");
    return repositoryModule.createIndexedDbInquiryRecordRepository();
  },
): InquiryRecordRepository {
  let repositoryPromise: Promise<InquiryRecordRepository> | null = null;
  const repository = () => {
    if (repositoryPromise !== null) return repositoryPromise;
    const loading = load();
    repositoryPromise = loading;
    void loading.catch(() => {
      if (repositoryPromise === loading) repositoryPromise = null;
    });
    return loading;
  };
  const forward = async <Value>(
    call: (loaded: InquiryRecordRepository) => Promise<RepositoryResult<Value>>,
  ): Promise<RepositoryResult<Value>> => {
    let loaded: InquiryRecordRepository;
    try {
      loaded = await repository();
    } catch {
      return UNAVAILABLE;
    }
    return call(loaded);
  };

  return Object.freeze({
    load: (treeId) => forward((loaded) => loaded.load(treeId)),
    save: (record, expectedVersion) => forward((loaded) => loaded.save(record, expectedVersion)),
    clear: (treeId, expectedVersion) => forward((loaded) => loaded.clear(treeId, expectedVersion)),
    close() {
      void repositoryPromise?.then((loaded) => loaded.close()).catch(() => undefined);
    },
  });
}
