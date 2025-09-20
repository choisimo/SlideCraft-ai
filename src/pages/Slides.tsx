import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { useSlides } from "@/hooks/useSlides";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Copy, Trash2, GripVertical } from "lucide-react";
import { useRef, useState } from "react";

export default function SlidesPage() {
  const { deck, addSlide, duplicate, remove, rename, reorder } = useSlides();
  const dragFrom = useRef<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <AppShell header={<Header documentTitle="슬라이드 관리" />} sidebar={<AppSidebar />} footer={<AIStatusBar />}>
      <div className="py-6 space-y-4">
        <div className="flex justify-between">
          <h3 className="font-semibold">{deck.title} <span className="text-muted-foreground text-sm">({deck.slides.length})</span></h3>
          <Button onClick={addSlide}><Plus className="w-4 h-4 mr-1" />슬라이드 추가</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {deck.slides.map((s, i) => (
            <Card key={s.id} className="p-3"
              draggable
              onDragStart={()=>{dragFrom.current=i;}}
              onDragOver={(e)=>e.preventDefault()}
              onDrop={()=>{ if(dragFrom.current===null) return; reorder(dragFrom.current, i); dragFrom.current=null; }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={()=>duplicate(s.id)} aria-label="복제"><Copy className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={()=>remove(s.id)} aria-label="삭제"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="aspect-[4/3] bg-muted rounded mb-2" />
              {editingId === s.id ? (
                <Input
                  autoFocus
                  defaultValue={s.title}
                  onBlur={(e)=>{rename(s.id, e.target.value); setEditingId(null);}}
                  onKeyDown={(e)=>{ if(e.key==="Enter"){ const t = (e.target as HTMLInputElement).value; rename(s.id,t); setEditingId(null);} }}
                />
              ) : (
                <div className="font-medium truncate cursor-text" onClick={()=>setEditingId(s.id)}>{s.title}</div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
