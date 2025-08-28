import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NotificationsPage = () => {
  const items = [
    { id: 1, text: "새 댓글이 달렸습니다", time: "방금" },
    { id: 2, text: "변환 작업이 완료되었습니다", time: "5분 전" },
  ];
  return (
    <AppShell header={<Header documentTitle="알림" />} sidebar={<AppSidebar />} footer={<AIStatusBar aiStatus={{stage:"대기",progress:0,status:"idle",details:"",collaborators:0}} autoSaveStatus="" /> }>
      <div className="py-6 space-y-3">
        {items.map(n => (
          <Card key={n.id} className="p-4 flex items-center justify-between">
            <span>{n.text}</span>
            <Badge variant="secondary">{n.time}</Badge>
          </Card>
        ))}
      </div>
    </AppShell>
  );
};

export default NotificationsPage;
