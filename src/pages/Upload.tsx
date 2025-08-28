import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpload } from "@/hooks/useUpload";
import { useCallback, useRef } from "react";
import { Upload as UploadIcon, X, RotateCcw, Trash2 } from "lucide-react";

export default function UploadPage() {
  const { jobs, enqueue, cancel, retry, remove } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = useCallback(() => inputRef.current?.click(), []);
  const onFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    enqueue(Array.from(files));
  }, [enqueue]);

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault(); e.stopPropagation();
    enqueue(Array.from(e.dataTransfer.files));
  };

  return (
    <AppShell header={<Header documentTitle="파일 업로드" />} sidebar={<AppSidebar />} footer={<AIStatusBar />} contentClassName="p-0">
      <div className="px-fluid-sm md:px-6 py-6 space-y-6">
        <Card className="p-8 border-dashed text-center" onDragOver={(e)=>{e.preventDefault();}} onDrop={onDrop}>
          <UploadIcon className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm mb-4">여기에 드래그 앤 드롭하거나, 버튼을 눌러 파일을 선택하세요.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={onPick}>파일 선택</Button>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e)=>onFiles(e.target.files)} />
          </div>
        </Card>

        <div className="space-y-2">
          <h3 className="font-semibold">업로드 큐</h3>
          {jobs.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">대기 중인 업로드가 없습니다.</Card>
          ) : (
            <div className="space-y-3">
              {jobs.map(j => (
                <Card key={j.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{j.file.name}</div>
                      <div className="text-xs text-muted-foreground">{(j.file.size/1024/1024).toFixed(2)} MB</div>
                    </div>
                    <div className="w-56">
                      <Progress value={j.progress} />
                    </div>
                    <div className="flex items-center gap-2">
                      {j.status === "uploading" && <Button size="icon" variant="ghost" onClick={()=>cancel(j.id)} aria-label="취소"><X className="w-4 h-4" /></Button>}
                      {j.status === "error" && <Button size="icon" variant="ghost" onClick={()=>retry(j.id)} aria-label="재시도"><RotateCcw className="w-4 h-4" /></Button>}
                      {(j.status === "done" || j.status==="canceled") && <Button size="icon" variant="ghost" onClick={()=>remove(j.id)} aria-label="제거"><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
