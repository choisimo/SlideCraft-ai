import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Bot, 
  Send, 
  Mic, 
  Paperclip,
  Upload,
  Sparkles,
  Loader2,
  FileText,
  Image,
  Download,
  MessageSquare,
  CheckCircle2,
  Clock,
  Zap
} from "lucide-react";
import { useState } from "react";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  type: "user" | "ai" | "system";
  content: string;
  timestamp: string;
  status?: "processing" | "completed" | "error";
  actions?: Array<{
    id: string;
    label: string;
    type: "primary" | "secondary";
    icon?: any;
  }>;
}

interface AIChatInterfaceProps {
  onSendMessage?: (message: string) => void;
  isProcessing?: boolean;
  className?: string;
}

export const AIChatInterface = ({ onSendMessage, isProcessing = false, className }: AIChatInterfaceProps) => {
  const [message, setMessage] = useState("");
  const { isMobile, isTablet } = useBreakpoint();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "system",
      content: "SlideCraft AI가 준비되었습니다! 📄➜🎨 문서를 업로드하거나 원하는 작업을 말씀해 주세요.",
      timestamp: "방금",
      actions: [
        { id: "upload", label: "파일 업로드", type: "primary", icon: FileText },
        { id: "create", label: "새 프레젠테이션", type: "secondary", icon: Sparkles }
      ]
    },
    {
      id: "2", 
      type: "user",
      content: "PDF 보고서를 PPT로 변환해주세요",
      timestamp: "1분 전"
    },
    {
      id: "3",
      type: "ai", 
      content: "네! PDF 파일을 프레젠테이션으로 변환해드리겠습니다. 파일을 업로드해주시면 AI가 자동으로:\n\n✨ 핵심 내용 추출 및 요약\n🎨 슬라이드 레이아웃 생성\n📊 데이터 시각화 최적화\n\n작업을 진행하겠습니다.",
      timestamp: "1분 전",
      status: "completed",
      actions: [
        { id: "upload-pdf", label: "PDF 업로드", type: "primary", icon: Upload }
      ]
    }
  ]);

  const handleSend = () => {
    if (!message.trim()) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      type: "user", 
      content: message,
      timestamp: "방금"
    };
    
    setMessages(prev => [...prev, newMessage]);
    onSendMessage?.(message);
    setMessage("");
    
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: "네, 즉시 처리하겠습니다! 🚀",
        timestamp: "방금",
        status: "processing"
      };
      setMessages(prev => [...prev, aiResponse]);
    }, 500);
  };

  const quickActions = [
    { id: "convert-doc", label: "문서 변환", icon: FileText, color: "bg-primary" },
    { id: "generate-slides", label: "슬라이드 생성", icon: Sparkles, color: "bg-secondary" },
    { id: "add-images", label: "이미지 추가", icon: Image, color: "bg-success" },
    { id: "export-ppt", label: "PPT 내보내기", icon: Download, color: "bg-warning" }
  ];

  return (
    <div className={cn(
      "flex-1 flex flex-col bg-background",
      "h-full overflow-hidden",
      className
    )}>
      
      {/* AI Chat Header */}
      <div className={cn(
        "border-b border-border bg-gradient-primary",
        "p-fluid-sm md:p-4"
      )}>
        <div className="flex items-center gap-3 text-white">
          <div className={cn(
            "bg-white/20 rounded-lg flex items-center justify-center",
            "w-8 h-8 md:w-10 md:h-10"
          )}>
            <Bot className={cn("w-4 h-4 md:w-6 md:h-6")} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={cn(
              "font-semibold truncate",
              "text-base md:text-lg"
            )}>
              SlideCraft AI Assistant
            </h2>
            <p className={cn(
              "text-white/80 truncate",
              "text-xs md:text-sm"
            )}>
              {isProcessing ? "처리 중..." : "모든 작업을 자동화해드립니다"}
            </p>
          </div>
          {isProcessing && (
            <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin shrink-0" />
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className={cn(
        "border-b border-border bg-muted/30",
        "p-fluid-sm md:p-4"
      )}>
        <div className={cn(
          "grid gap-2 md:gap-3",
          isMobile ? "grid-cols-2" : isTablet ? "grid-cols-3" : "grid-cols-4"
        )}>
          {quickActions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              className={cn(
                "flex items-center gap-2 h-auto py-2 px-3",
                "md:py-3 md:px-4"
              )}
            >
              <div className={cn(
                action.color,
                "rounded-lg flex items-center justify-center",
                "w-6 h-6 md:w-8 md:h-8"
              )}>
                <action.icon className="w-3 h-3 md:w-4 md:h-4 text-white" />
              </div>
              <span className={cn(
                "font-medium truncate",
                "text-xs md:text-sm"
              )}>
                {action.label}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className={cn(
        "flex-1 space-y-3 overflow-y-auto",
        "p-fluid-sm md:p-4",
        "md:space-y-4"
      )}>
        {messages.map((msg) => (
          <div key={msg.id} className={cn(
            "flex gap-2 md:gap-3",
            msg.type === "user" && "flex-row-reverse"
          )}>
            
            {/* Avatar */}
            <Avatar className={cn(
              "mt-1 shrink-0",
              "w-6 h-6 md:w-8 md:h-8"
            )}>
              {msg.type === "ai" || msg.type === "system" ? (
                <div className="w-full h-full bg-primary rounded-full flex items-center justify-center">
                  <Bot className="w-3 h-3 md:w-4 md:h-4 text-white" />
                </div>
              ) : (
                <>
                  <AvatarImage src="" alt="User" />
                  <AvatarFallback className="text-xs">나</AvatarFallback>
                </>
              )}
            </Avatar>

            {/* Message Content */}
            <div className={cn(
              "flex-1 space-y-2 min-w-0",
              msg.type === "user" && "items-end"
            )}>
              <Card className={cn(
                "p-3 max-w-full md:max-w-md",
                msg.type === "user" 
                  ? "bg-primary text-white ml-auto" 
                  : msg.type === "system"
                  ? "bg-gradient-to-r from-primary/10 to-secondary/10 border-dashed"
                  : "bg-card"
              )}>
                <p className={cn(
                  "leading-relaxed whitespace-pre-line break-words",
                  "text-xs md:text-sm"
                )}>
                  {msg.content}
                </p>
                
                {/* Status Indicator */}
                {msg.status && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/20">
                    {msg.status === "processing" && (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs">처리 중...</span>
                      </>
                    )}
                    {msg.status === "completed" && (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-success" />
                        <span className="text-xs">완료</span>
                      </>
                    )}
                  </div>
                )}
              </Card>

              {/* Action Buttons */}
              {msg.actions && (
                <div className="flex gap-1 md:gap-2 flex-wrap">
                  {msg.actions.map((action) => (
                    <Button
                      key={action.id}
                      variant={action.type === "primary" ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-8"
                    >
                      {action.icon && <action.icon className="w-3 h-3 mr-1" />}
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <p className="text-xs text-muted-foreground">{msg.timestamp}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className={cn(
        "border-t border-border bg-background",
        "p-fluid-sm md:p-4"
      )}>
        <div className="flex gap-2 md:gap-3 items-end">
          <div className="flex-1">
            <div className={cn(
              "flex items-center gap-2 bg-muted/50 rounded-lg border border-border",
              "p-2 md:p-3"
            )}>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isMobile ? "AI에게 요청하세요..." : "AI에게 작업을 요청하세요... (예: PDF를 PPT로 변환해줘)"}
                className="border-0 bg-transparent focus:ring-0 text-sm"
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                disabled={isProcessing}
              />
              <div className="flex items-center gap-1 md:gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("w-6 h-6 md:w-8 md:h-8")}
                >
                  <Paperclip className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                {!isMobile && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8"
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <Button 
            onClick={handleSend} 
            disabled={!message.trim() || isProcessing}
            className={cn(
              "rounded-lg",
              "w-10 h-10 md:w-12 md:h-12"
            )}
          >
            {isProcessing ? (
              <Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin" />
            ) : (
              <Send className="w-3 h-3 md:w-4 md:h-4" />
            )}
          </Button>
        </div>

        {/* AI Status */}
        {!isMobile && (
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse-slow"></div>
              <span>AI가 대기 중입니다</span>
            </div>
            <div className="flex items-center gap-4">
              <span>⚡ 자동화 모드</span>
              <span>🎯 스마트 제안 활성화</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};