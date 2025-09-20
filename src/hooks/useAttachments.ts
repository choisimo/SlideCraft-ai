import { useMemo, useState } from "react";
import { storage, StoredFile } from "@/lib/storage";

export function useAttachments() {
  const [files, setFiles] = useState<StoredFile[]>(() => storage.files.list());
  const refresh = () => setFiles(storage.files.list());
  const remove = (id: string) => {
    storage.files.remove(id);
    refresh();
  };

  const search = (q: string, tag?: string) => {
    const lower = q.toLowerCase();
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(lower) && (!tag || (f.tags || []).includes(tag))
    );
  };

  const addTag = (id: string, tag: string) => {
    const f = files.find((x) => x.id === id);
    if (!f) return;
    const next = { ...f, tags: Array.from(new Set([...(f.tags || []), tag])) };
    storage.files.upsert(next);
    refresh();
  };

  return { files, refresh, remove, search, addTag };
}
