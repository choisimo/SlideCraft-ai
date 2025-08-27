import React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  auxiliary?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  header,
  sidebar,
  auxiliary,
  footer,
  className,
  contentClassName
}) => {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className={cn(
        "h-screen flex flex-col bg-background w-full",
        "max-w-[100vw] overflow-x-hidden",
        className
      )}>
        {header && (
          <header className="shrink-0 border-b border-border">
            {header}
          </header>
        )}
        
        <div className="flex flex-1 overflow-hidden">
          {sidebar && (
            <aside className="shrink-0">
              {sidebar}
            </aside>
          )}
          
          <main className={cn(
            "flex-1 flex flex-col overflow-hidden",
            "container mx-auto",
            "px-fluid-sm md:px-fluid-md lg:px-fluid-lg",
            "max-w-content",
            contentClassName
          )}>
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-auto">
                {children}
              </div>
              
              {auxiliary && !isMobile && (
                <aside className="w-80 shrink-0 border-l border-border overflow-auto">
                  {auxiliary}
                </aside>
              )}
            </div>
          </main>
          
          {auxiliary && isMobile && (
            <div className="fixed inset-x-0 bottom-0 z-50">
              {auxiliary}
            </div>
          )}
        </div>
        
        {footer && (
          <footer className="shrink-0 border-t border-border">
            {footer}
          </footer>
        )}
      </div>
    </SidebarProvider>
  );
};

export default AppShell;