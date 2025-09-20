import React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Layers,
  Download,
  History,
  Settings,
  Zap,
  Users,
  MessageSquare,
  Upload,
  Sparkles,
  BarChart3,
  Palette,
  Menu
} from "lucide-react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ResponsiveSidebarProps {
  currentProgress?: number;
  activeUsers?: number;
  className?: string;
}

const SidebarContent_: React.FC<{
  selectedTool: string;
  setSelectedTool: (tool: string) => void;
  currentProgress: number;
  activeUsers: number;
  state?: "expanded" | "collapsed";
  isMobileDrawer?: boolean;
}> = ({ 
  selectedTool, 
  setSelectedTool, 
  currentProgress, 
  activeUsers, 
  state = "expanded",
  isMobileDrawer = false 
}) => {
  const mainTools = [
    { id: "chat", title: "AI 채팅", icon: MessageSquare, badge: undefined },
    { id: "upload", title: "파일 업로드", icon: Upload },
    { id: "slides", title: "슬라이드 관리", icon: Layers },
    { id: "collaboration", title: "협업", icon: Users, count: activeUsers },
  ];

  const aiFeatures = [
    { id: "generate", title: "자동 생성", icon: Sparkles },
    { id: "enhance", title: "콘텐츠 개선", icon: Zap },
    { id: "visualize", title: "데이터 시각화", icon: BarChart3 },
    { id: "design", title: "디자인 제안", icon: Palette },
  ];

  const quickActions = [
    { id: "export", title: "PPTX 내보내기", icon: Download },
    { id: "history", title: "버전 히스토리", icon: History },
    { id: "settings", title: "설정", icon: Settings },
  ];

  return (
    <>
      {/* Header */}
      <div className={cn(
        "p-4 border-b border-sidebar-border",
        isMobileDrawer && "pb-2"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 gradient-hero rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {(state !== "collapsed" || isMobileDrawer) && (
            <div className="flex-1">
              <h3 className="font-semibold text-sidebar-foreground">SlideCraft AI</h3>
              <p className="text-xs text-sidebar-foreground/60">자동화 워크스페이스</p>
            </div>
          )}
          {!isMobileDrawer && <SidebarTrigger className="ml-auto" />}
        </div>
      </div>

      {/* AI Progress */}
      {(state !== "collapsed" || isMobileDrawer) && currentProgress > 0 && (
        <div className="p-4">
          <Card className="p-3 bg-primary-light/50 border-primary/20">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">AI 처리 중...</span>
                <Badge variant="outline" className="text-xs">
                  {currentProgress}%
                </Badge>
              </div>
              <Progress value={currentProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                문서를 슬라이드로 변환하고 있습니다
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Main Tools */}
      <SidebarGroup>
        <SidebarGroupLabel>주요 기능</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
             {mainTools.map((tool) => (
              <SidebarMenuItem key={tool.id}>
                <SidebarMenuButton 
                  asChild
                  className={cn(
                    selectedTool === tool.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                    isMobileDrawer && "py-3"
                  )}
                >
                  <a href={
                    tool.id === "chat" ? "/" :
                    tool.id === "upload" ? "/upload" :
                    tool.id === "slides" ? "/slides" :
                    tool.id === "collaboration" ? "/collab" : "/"
                  }>
                    <tool.icon className="w-4 h-4" />
                    {(state !== "collapsed" || isMobileDrawer) && (
                      <>
                        <span>{tool.title}</span>
                        {tool.badge && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            {tool.badge}
                          </Badge>
                        )}
                        {tool.count && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {tool.count}
                          </Badge>
                        )}
                      </>
                    )}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* AI Features */}
      <SidebarGroup>
        <SidebarGroupLabel>AI 기능</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {aiFeatures.map((feature) => (
              <SidebarMenuItem key={feature.id}>
                <SidebarMenuButton className={isMobileDrawer ? "py-3" : ""}>
                  <feature.icon className="w-4 h-4" />
                  {(state !== "collapsed" || isMobileDrawer) && <span>{feature.title}</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Quick Actions */}
      <SidebarGroup>
        <SidebarGroupLabel>빠른 작업</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
             {quickActions.map((action) => (
              <SidebarMenuItem key={action.id}>
                <SidebarMenuButton className={isMobileDrawer ? "py-3" : ""} asChild>
                  <a href={action.id === "export" ? "/attachments" : action.id === "history" ? "/slides" : "/settings"}>
                    <action.icon className="w-4 h-4" />
                    {(state !== "collapsed" || isMobileDrawer) && <span>{action.title}</span>}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Auto Actions Card */}
      {(state !== "collapsed" || isMobileDrawer) && (
        <div className="p-4">
          <Card className="p-4 bg-gradient-to-br from-secondary/10 to-primary/10 border-dashed border-primary/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <h4 className="font-semibold text-sm">자동화 모드</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI가 파일 업로드부터 최종 프레젠테이션까지 모든 과정을 자동으로 처리합니다.
              </p>
              <Button variant="outline" size="sm" className="w-full text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                자동화 시작
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({ 
  currentProgress = 0, 
  activeUsers = 3,
  className 
}) => {
  const { state } = useSidebar();
  const [selectedTool, setSelectedTool] = useState("chat");
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 z-50 md:hidden bg-background/80 backdrop-blur-sm border border-border/50"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-[85vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="sr-only">Navigation Menu</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-auto">
              <SidebarContent_
                selectedTool={selectedTool}
                setSelectedTool={(tool) => {
                  setSelectedTool(tool);
                  setIsDrawerOpen(false);
                }}
                currentProgress={currentProgress}
                activeUsers={activeUsers}
                state="expanded"
                isMobileDrawer={true}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Sidebar 
      className={cn(
        state === "collapsed" ? "w-16" : "w-80",
        "transition-all duration-300 ease-in-out",
        className
      )} 
      collapsible="icon"
    >
      <SidebarContent>
        <SidebarContent_
          selectedTool={selectedTool}
          setSelectedTool={setSelectedTool}
          currentProgress={currentProgress}
          activeUsers={activeUsers}
          state={state}
        />
      </SidebarContent>
    </Sidebar>
  );
};

// Keep backward compatibility
export const AppSidebar = ResponsiveSidebar;