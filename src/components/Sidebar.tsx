import { Button } from "@/components/ui/button";
import { 
  Bot, 
  FileText, 
  Settings, 
  GitBranch, 
  Sparkles,
  Brain,
  Database
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar = ({ activeTab, setActiveTab }: SidebarProps) => {
  const menuItems = [
    { 
      id: "ai-agent", 
      label: "AI Agent", 
      icon: Bot,
      description: "Chat with your AI documentation agent"
    },
    { 
      id: "documents", 
      label: "Documents", 
      icon: FileText,
      description: "Manage project documents"
    },
    { 
      id: "capabilities", 
      label: "Capabilities", 
      icon: Brain,
      description: "AI agent skills and functions"
    },
    { 
      id: "git", 
      label: "Git Integration", 
      icon: GitBranch,
      description: "Connect and sync with repositories"
    }
  ];

  return (
    <div className="h-full bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <Bot className="h-6 w-6 text-sidebar-primary" />
            <Sparkles className="h-4 w-4 text-sidebar-accent-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-sidebar-foreground">Auto-Doc AI</h2>
            <p className="text-xs text-sidebar-foreground/70">Self-Evolving Agent</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start h-auto p-3 ${
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">{item.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{item.description}</div>
              </div>
            </Button>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center space-x-2 text-xs text-sidebar-foreground/70">
          <Database className="h-3 w-3" />
          <span>Connected to Supabase</span>
        </div>
      </div>
    </div>
  );
};