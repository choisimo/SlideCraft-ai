import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  FileText, 
  Users, 
  Sparkles, 
  Settings, 
  Bell,
  Search,
  Menu
} from "lucide-react";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
}

interface HeaderProps {
  documentTitle?: string;
  collaborators?: User[];
  onSave?: () => void;
  onShare?: () => void;
  className?: string;
}

export const Header = ({ 
  documentTitle = "Untitled Presentation", 
  collaborators = [],
  onSave,
  onShare,
  className
}: HeaderProps) => {
  const { isMobile, isTablet } = useBreakpoint();

  return (
    <header className={cn(
      "border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50",
      className
    )}>
      <div className={cn(
        "flex items-center justify-between h-14 md:h-16",
        "px-fluid-sm md:px-6"
      )}>
        {/* Left Section - Logo & Document */}
        <div className="flex items-center gap-3 md:gap-6 flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3">
            <div className={cn(
              "gradient-hero rounded-lg flex items-center justify-center",
              "w-6 h-6 md:w-8 md:h-8"
            )}>
              <Sparkles className="w-3 h-3 md:w-5 md:h-5 text-white" />
            </div>
            {!isMobile && (
              <span className="font-semibold text-base md:text-lg text-foreground">
                SlideCraft AI
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground min-w-0 flex-1">
            <FileText className="w-3 h-3 md:w-4 md:h-4 shrink-0" />
            <span className={cn(
              "font-medium text-foreground truncate",
              "text-xs md:text-sm"
            )}>
              {documentTitle}
            </span>
          </div>
        </div>

        {/* Center Section - Collaborators */}
        {!isMobile && collaborators.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <div className="flex -space-x-2">
                {collaborators.slice(0, isTablet ? 2 : 3).map((user) => (
                  <Avatar key={user.id} className={cn(
                    "border-2 border-background relative",
                    "w-6 h-6 md:w-8 md:h-8"
                  )}>
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="text-xs font-medium">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                    {user.isOnline && (
                      <div className={cn(
                        "absolute bg-success rounded-full border-2 border-background",
                        "-bottom-0.5 -right-0.5 w-2 h-2 md:w-3 md:h-3"
                      )} />
                    )}
                  </Avatar>
                ))}
                {collaborators.length > (isTablet ? 2 : 3) && (
                  <div className={cn(
                    "bg-muted border-2 border-background rounded-full flex items-center justify-center",
                    "w-6 h-6 md:w-8 md:h-8"
                  )}>
                    <span className="text-xs font-medium text-muted-foreground">
                      +{collaborators.length - (isTablet ? 2 : 3)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right Section - Actions */}
        <div className="flex items-center gap-1 md:gap-3">
          {isMobile ? (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={onSave}
                className="h-8 px-3 text-xs"
              >
                저장
              </Button>
              <Button 
                variant="hero" 
                size="sm"
                onClick={onShare}
                className="h-8 px-3 text-xs"
              >
                공유
              </Button>
              <Button variant="ghost" size="icon" className="w-8 h-8">
                <Settings className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              {!isTablet && (
                <>
                  <Button variant="ghost" size="icon">
                    <Search className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Bell className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={onSave}>
                Save
              </Button>
              <Button variant="hero" onClick={onShare}>
                Share
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};