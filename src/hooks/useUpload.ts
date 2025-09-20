import { useEffect, useRef, useState } from "react";
import { storage, UploadJob, StoredFile } from "@/lib/storage";

export function useUpload() {
  const [jobs, setJobs] = useState<UploadJob[]>(() => storage.uploads.list());
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    storage.uploads.save(jobs);
  }, [jobs]);

  const startJob = (job: UploadJob) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: "uploading", progress: 1 } : j)));
    const tick = () => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== job.id || j.status !== "uploading") return j;
          const next = Math.min(100, j.progress + Math.random() * 20 + 5);
          if (next >= 100) {
            const stored: StoredFile = { ...j.file, url: URL.createObjectURL(new Blob()) };
            storage.files.upsert(stored);
            return { ...j, progress: 100, status: "done" };
          }
          return { ...j, progress: Math.floor(next) };
        })
      );
      const current = timers.current[job.id];
      if (current) window.clearTimeout(current);
      const updated = storage.uploads.list().find((x) => x.id === job.id);
      if (updated && updated.status === "uploading") {
        timers.current[job.id] = window.setTimeout(tick, 400);
      }
    };
    timers.current[job.id] = window.setTimeout(tick, 400);
  };

  const enqueue = (files: File[]) => {
    const mapped = files.map<UploadJob>((f) => ({
      id: crypto.randomUUID(),
      file: { id: crypto.randomUUID(), name: f.name, type: f.type, size: f.size, createdAt: Date.now() },
      status: "queued",
      progress: 0,
    }));
    setJobs((prev) => [...mapped, ...prev]);
    mapped.forEach(startJob);
  };

  const cancel = (id: string) => setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "canceled" } : j)));
  const retry = (id: string) => {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    setJobs((prev) => prev.map((x) => (x.id === id ? { ...x, status: "queued", progress: 0, error: undefined } : x)));
    startJob({ ...j, status: "queued", progress: 0 });
  };
  const remove = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id));

  return { jobs, enqueue, cancel, retry, remove };
}
