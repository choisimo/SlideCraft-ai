import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { useAttachments } from "@/hooks/useAttachments";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Tag } from "lucide-react";
import { useMemo, useState } from "react";

export default function AttachmentsPage() {
  const { files, remove, search, addTag } = useAttachments();
  const [q, setQ] = useState("");
  const results = useMemo(()=> search(q), [q, files]);

  return (
    <AppShell header={<Header documentTitle="첨부 파일" />} sidebar={<AppSidebar />} footer={<AIStatusBar />}>
      <div className="py-6 space-y-4">
        <Input placeholder="파일 검색" value={q} onChange={(e)=>setQ(e.target.value)} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map(f => (
            <Card key={f.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.type}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={()=>remove(f.id)} aria-label="삭제">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(f.tags||[]).map(t => <Badge key={t} variant="secondary">#{t}</Badge>)}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={()=>addTag(f.id,"doc")}><Tag className="w-3 h-3 mr-1" />doc</Button>
                <Button size="sm" variant="outline" onClick={()=>addTag(f.id,"img")}><Tag className="w-3 h-3 mr-1" />img</Button>
              </div>
            </Card>
          ))}
          {results.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">파일이 없습니다. 업로드 페이지에서 파일을 추가하세요.</Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
