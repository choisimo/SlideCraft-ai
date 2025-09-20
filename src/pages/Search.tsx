import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon } from "lucide-react";
import { useState } from "react";

const SearchPage = () => {
  const [q, setQ] = useState("");
  return (
    <AppShell header={<Header documentTitle="검색" />} sidebar={<AppSidebar />} footer={<AIStatusBar aiStatus={{stage:"대기",progress:0,status:"idle",details:"검색 준비됨",collaborators:0}} autoSaveStatus="" /> }>
      <div className="py-6">
        <div className="flex gap-2 mb-4">
          <Input placeholder="검색어를 입력하세요" value={q} onChange={(e)=>setQ(e.target.value)} />
          <Button><SearchIcon className="w-4 h-4 mr-1"/>검색</Button>
        </div>
        <Card className="p-6 text-sm text-muted-foreground">검색 결과가 여기에 표시됩니다.</Card>
      </div>
    </AppShell>
  );
};

export default SearchPage;
