export type StoredFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  tags?: string[];
  url?: string;
};

export type UploadJob = {
  id: string;
  file: StoredFile;
  status: "queued" | "uploading" | "done" | "error" | "canceled";
  progress: number;
  error?: string;
};

export type Slide = { id: string; title: string; notes?: string; thumbnail?: string };
export type Deck = { id: string; title: string; slides: Slide[]; sections?: { id: string; title: string; slideIds: string[] }[] };

const KEY = {
  files: "sc_files",
  deck: "sc_deck",
  uploads: "sc_uploads",
};

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  localStorage.setItem(k, JSON.stringify(v));
};

export const storage = {
  files: {
    list: (): StoredFile[] => read(KEY.files, [] as StoredFile[]),
    upsert: (f: StoredFile) => {
      const all = read<StoredFile[]>(KEY.files, []);
      const i = all.findIndex((x) => x.id === f.id);
      if (i >= 0) all[i] = f;
      else all.unshift(f);
      write(KEY.files, all);
      return f;
    },
    remove: (id: string) => {
      write(
        KEY.files,
        read<StoredFile[]>(KEY.files, []).filter((f) => f.id !== id)
      );
    },
  },
  uploads: {
    list: (): UploadJob[] => read(KEY.uploads, [] as UploadJob[]),
    save: (jobs: UploadJob[]) => write(KEY.uploads, jobs),
  },
  deck: {
    get: (): Deck =>
      read(KEY.deck, {
        id: "deck-1",
        title: "내 프레젠테이션",
        slides: [
          { id: "s1", title: "소개" },
          { id: "s2", title: "문제" },
          { id: "s3", title: "해결" },
        ],
      } as Deck),
    set: (d: Deck) => write(KEY.deck, d),
  },
};
