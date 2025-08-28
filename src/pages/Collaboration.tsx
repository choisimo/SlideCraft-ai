import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { Card } from "@/components/ui/card";
import { usePresence } from "@/hooks/usePresence";

export default function CollaborationPage() {
  const { users } = usePresence();
  return (
    <AppShell header={<Header documentTitle="협업" />} sidebar={<AppSidebar />} footer={<AIStatusBar />}>
      <div className="py-6 space-y-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">온라인 사용자</h3>
          <div className="flex gap-2 flex-wrap">
            {users.map((u) => (
              <div key={u.id} className="px-3 py-2 rounded border" style={{ borderColor: u.color }}>
                <span className="font-medium" style={{ color: u.color }}>
                  {u.name}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{u.isOnline ? "온라인" : "오프라인"}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4 text-sm text-muted-foreground">
          댓글/쓰레드/멘션, 커서 표시 등은 추후 백엔드/CRDT 연동 시 추가됩니다. 현재는 프론트 시뮬만 제공합니다.
        </Card>
      </div>
    </AppShell>
  );
}
