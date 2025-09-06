import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { AIChatInterface } from "@/components/AIChatInterface";
import { AIStatusBar } from "@/components/AIStatusBar";
import { AppShell } from "@/components/AppShell";
import { useState } from "react";
import { toast } from "sonner";
import { CommentPanel } from "@/components/CommentPanel";

const Index = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number>(() => Date.now());

  const collaborators: Array<{ id: string; name: string; avatar?: string; isOnline: boolean }>= [];

  const handleSave = () => {
    setLastSavedAt(Date.now());
    toast.success("프레젠테이션이 자동 저장되었습니다!");
  };

  const handleShare = () => {
    toast.success("공유 링크가 클립보드에 복사되었습니다!");
  };

  const handleSendMessage = (message: string) => {
    toast.info(`AI가 "${message}" 작업을 시작합니다...`);
  };

  const aiStatus = {
    stage: isProcessing ? "작업 처리 중" : "대기 중",
    progress: 0,
    status: isProcessing ? "processing" as const : "idle" as const,
    details: isProcessing ? "AI가 요청을 처리하고 있습니다..." : "다음 작업을 위해 AI가 대기하고 있습니다",
    collaborators: collaborators.length
  };

  return (
    <AppShell
      header={
        <Header 
          documentTitle="AI 자동화 프레젠테이션"
          collaborators={collaborators}
          onSave={handleSave}
          onShare={handleShare}
        />
      }
      sidebar={
        <AppSidebar 
          currentProgress={isProcessing ? 0 : 0}
          activeUsers={collaborators.length}
        />
      }
      auxiliary={
         <CommentPanel comments={[]} />
      }
      footer={
        <AIStatusBar 
          aiStatus={aiStatus}
          autoSaveAt={lastSavedAt}
        />
      }
      contentClassName="p-0"
    >
      <AIChatInterface 
        onSendMessage={handleSendMessage}
        onProcessingChange={setIsProcessing}
        isProcessing={isProcessing}
      />
    </AppShell>
  );
};

export default Index;
