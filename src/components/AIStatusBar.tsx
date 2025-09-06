import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
   CheckCircle2, 
   Loader2, 
   AlertCircle,
   Users,
   Zap,
   FileText,
   Sparkles
} from "lucide-react";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cn } from "@/lib/utils";
import React from "react";

interface AIStatus {
  stage: string;
  progress: number;
  status: "idle" | "processing" | "completed" | "error";
  details?: string;
  collaborators?: number;
}

interface AIStatusBarProps {
  aiStatus?: AIStatus;
  autoSaveStatus?: string; // fallback string
  autoSaveAt?: number; // epoch ms to compute relative time
  className?: string;
}
 
function formatRelativeTime(from: number, now: number): string {
  const diffMs = Math.max(0, now - from);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return "방금";
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  const d = new Date(from);
  return d.toLocaleDateString();
}
 
export const AIStatusBar = ({ 
  aiStatus = {
    stage: "대기 중",
    progress: 0,
    status: "idle",
    details: "AI가 다음 작업을 대기하고 있습니다"
  },
  autoSaveStatus = "자동 저장됨 • 방금",
  autoSaveAt,
  className
}: AIStatusBarProps) => {
  const { isMobile, isTablet } = useBreakpoint();
  const [nowTick, setNowTick] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const autoSaveDisplay = autoSaveAt ? `자동 저장됨 • ${formatRelativeTime(autoSaveAt, nowTick)}` : autoSaveStatus;
  
  const getStatusIcon = () => {
    switch (aiStatus.status) {
      case "processing":
        return <Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin text-primary" />;
      case "completed":
        return <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-success" />;
      case "error":
        return <AlertCircle className="w-3 h-3 md:w-4 md:h-4 text-destructive" />;
      default:
        return <Zap className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (aiStatus.status) {
      case "processing":
        return "border-primary/20 bg-primary-light/30";
      case "completed":
        return "border-success/20 bg-success-light/30";
      case "error":
        return "border-destructive/20 bg-destructive/5";
      default:
        return "border-border bg-muted/30";
    }
  };

  if (isMobile) {
    return (
      <div className={cn(
        "border-t border-border bg-background/95 backdrop-blur-sm",
        className
      )}>
        <div className="px-fluid-sm py-2">
          {/* Mobile Compact Layout */}
          <Card className={cn("px-3 py-2 border", getStatusColor())}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getStatusIcon()}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{aiStatus.stage}</span>
                    {aiStatus.status === "processing" && (
                      <Badge variant="outline" className="text-xs animate-pulse">
                        처리 중
                      </Badge>
                    )}
                  </div>
                  {aiStatus.progress > 0 && aiStatus.status === "processing" && (
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={aiStatus.progress} className="w-20 h-1" />
                      <span className="text-xs text-muted-foreground">
                        {aiStatus.progress}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-success" />
                <span className="hidden xs:inline">저장됨</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-t border-border bg-background/95 backdrop-blur-sm",
      className
    )}>
      <div className={cn(
        "px-fluid-md py-3",
        "md:px-6"
      )}>
        
        {/* Main Status */}
        <div className="flex items-center justify-between">
          
          {/* AI Status */}
          <Card className={cn("px-3 py-2 md:px-4 border", getStatusColor())}>
            <div className="flex items-center gap-2 md:gap-3">
              {getStatusIcon()}
              
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm font-medium">AI 상태:</span>
                  <span className="text-xs md:text-sm">{aiStatus.stage}</span>
                  {aiStatus.status === "processing" && (
                    <Badge variant="outline" className="text-xs animate-pulse">
                      처리 중
                    </Badge>
                  )}
                </div>
                
                {aiStatus.progress > 0 && aiStatus.status === "processing" && (
                  <div className="flex items-center gap-2">
                    <Progress value={aiStatus.progress} className="w-24 md:w-32 h-1 md:h-1.5" />
                    <span className="text-xs text-muted-foreground">
                      {aiStatus.progress}%
                    </span>
                  </div>
                )}
                
                {aiStatus.details && !isTablet && (
                  <p className="text-xs text-muted-foreground max-w-xs truncate">
                    {aiStatus.details}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Center Stats */}
          {!isTablet && (
            <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm text-muted-foreground">
              
              {/* Collaboration */}
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 md:w-4 md:h-4" />
                 <span>{aiStatus.collaborators ?? 0}명</span>
              </div>

              {/* Document */}
              <div className="flex items-center gap-2">
                <FileText className="w-3 h-3 md:w-4 md:h-4" />
                 <span>슬라이드</span>
              </div>

              {/* AI Features */}
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
                <span>자동화 활성</span>
              </div>
            </div>
          )}

          {/* Auto Save Status */}
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-success" />
            <span
              className={cn(
                isTablet ? "hidden sm:inline" : ""
              )}
              title={autoSaveAt ? new Date(autoSaveAt).toLocaleString() : undefined}
            >
              {autoSaveAt ? `자동 저장됨 • ${formatRelativeTime(autoSaveAt, nowTick)}` : autoSaveStatus}
            </span>
          </div>
        </div>

        {/* Quick Stats */}
        {aiStatus.status === "processing" && !isMobile && (
          <div className="mt-2 md:mt-3 flex items-center gap-2 md:gap-4 text-xs text-muted-foreground">
            <span>📄 문서 분석 완료</span>
            <span>•</span>
            <span>🎨 레이아웃 생성 중</span>
            {!isTablet && (
              <>
                <span>•</span>
                 <span>⏱️ 처리 중...</span>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};