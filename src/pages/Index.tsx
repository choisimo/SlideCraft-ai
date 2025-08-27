import { Header } from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { AIChatInterface } from "@/components/AIChatInterface";
import { AIStatusBar } from "@/components/AIStatusBar";
import { AppShell } from "@/components/AppShell";
import { useState } from "react";
import { toast } from "sonner";

const Index = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);

  const collaborators = [
    { id: "1", name: "Alex Chen", avatar: "", isOnline: true },
    { id: "2", name: "Sarah Kim", avatar: "", isOnline: true },
    { id: "3", name: "Jamie Park", avatar: "", isOnline: false },
  ];

  const handleSave = () => {
    toast.success("프레젠테이션이 자동 저장되었습니다!");
  };

  const handleShare = () => {
    toast.success("공유 링크가 클립보드에 복사되었습니다!");
  };

  const handleSendMessage = (message: string) => {
    setIsProcessing(true);
    setCurrentProgress(0);
    
    toast.info(`AI가 "${message}" 작업을 시작합니다...`);
    
    const progressInterval = setInterval(() => {
      setCurrentProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setIsProcessing(false);
          toast.success("작업이 완료되었습니다!");
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const aiStatus = {
    stage: isProcessing ? "문서 변환 중" : "대기 중",
    progress: currentProgress,
    status: isProcessing ? "processing" as const : "idle" as const,
    details: isProcessing ? "AI가 PDF 문서를 분석하고 슬라이드로 변환하고 있습니다..." : "다음 작업을 위해 AI가 대기하고 있습니다",
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
          currentProgress={isProcessing ? currentProgress : 0}
          activeUsers={collaborators.length}
        />
      }
      footer={
        <AIStatusBar 
          aiStatus={aiStatus}
          autoSaveStatus="자동 저장됨 • 방금"
        />
      }
      contentClassName="p-0"
    >
      <AIChatInterface 
        onSendMessage={handleSendMessage}
        isProcessing={isProcessing}
      />
    </AppShell>
  );
};

export default Index;
