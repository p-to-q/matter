import type {
  LabelRepository,
  LabelWriteReceipt,
} from "./label-repository";

const STORAGE_UNAVAILABLE: LabelWriteReceipt = Object.freeze({
  ok: false,
  code: "STORAGE_UNAVAILABLE",
});

type RepositoryLoader = () => Promise<LabelRepository>;

/** Keeps the local label database outside the first-paint graph until it is needed. */
export function createLazyLabelRepository(
  load: RepositoryLoader = async () => {
    const repositoryModule = await import("./label-repository");
    return repositoryModule.createIndexedDbLabelRepository();
  },
): LabelRepository {
  let closed = false;
  let repositoryPromise: Promise<LabelRepository> | null = null;
  const repository = () => {
    if (closed) return Promise.reject(new Error("Label repository is closed."));
    if (repositoryPromise !== null) return repositoryPromise;
    const loading = load().then((loaded) => {
      if (!closed) return loaded;
      loaded.close();
      throw new Error("Label repository is closed.");
    });
    repositoryPromise = loading;
    void loading.catch(() => {
      // A transient chunk or storage bootstrap failure must not poison every
      // later manual-name retry in this session.
      if (!closed && repositoryPromise === loading) repositoryPromise = null;
    });
    return loading;
  };

  return Object.freeze({
    async loadAll(treeId, liveNodeIds) {
      try {
        return await (await repository()).loadAll(treeId, liveNodeIds);
      } catch {
        return Object.freeze([]);
      }
    },
    async put(treeId, record) {
      try {
        return await (await repository()).put(treeId, record);
      } catch {
        return STORAGE_UNAVAILABLE;
      }
    },
    async remove(treeId, nodeIds) {
      try {
        return await (await repository()).remove(treeId, nodeIds);
      } catch {
        return STORAGE_UNAVAILABLE;
      }
    },
    async clear(treeId) {
      try {
        await (await repository()).clear(treeId);
      } catch {
        // The repository contract makes derived cache cleanup best effort.
      }
    },
    close() {
      if (closed) return;
      closed = true;
      void repositoryPromise?.then((loaded) => loaded.close()).catch(() => undefined);
    },
  });
}
