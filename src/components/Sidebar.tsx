import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Upload, 
  FileText, 
  Image, 
  Sparkles, 
  MessageSquare,
  Layers,
  Download,
  History
} from "lucide-react";

interface SidebarProps {
  onUpload?: () => void;
  onAIAssist?: () => void;
  onExport?: () => void;
}

export const Sidebar = ({ onUpload, onAIAssist, onExport }: SidebarProps) => {
  return (
    <aside className="w-80 border-r border-border bg-background/50 backdrop-blur-sm h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        
        {/* File Upload Section */}
        <Card className="p-4 border-dashed border-2 border-primary/20 bg-primary-light/30 hover:border-primary/40 transition-smooth cursor-pointer" onClick={onUpload}>
          <div className="text-center space-y-3">
            <div className="w-12 h-12 gradient-primary rounded-lg mx-auto flex items-center justify-center">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Upload Documents</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Drop PPTX, PDF, or DOCX files here
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full">
              Browse Files
            </Button>
          </div>
        </Card>

        {/* AI Assistant */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold text-foreground">AI Assistant</h3>
          </div>
          
          <div className="space-y-2">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onAIAssist}>
              <FileText className="w-4 h-4 mr-2" />
              Generate Slides
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Image className="w-4 h-4 mr-2" />
              Suggest Images
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <MessageSquare className="w-4 h-4 mr-2" />
              Improve Content
            </Button>
          </div>
        </Card>

        {/* Slide Management */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
              <Layers className="w-4 h-4 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground">Slides</h3>
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[1, 2, 3, 4, 5].map((slide) => (
              <div 
                key={slide}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted-hover transition-smooth cursor-pointer"
              >
                <div className="w-12 h-8 bg-muted rounded border border-border flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">{slide}</span>
                </div>
                <span className="text-sm text-foreground flex-1">Slide {slide}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Export & History */}
        <Card className="p-4 space-y-4">
          <h3 className="font-semibold text-foreground">Actions</h3>
          
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onExport}>
              <Download className="w-4 h-4 mr-2" />
              Export PPTX
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <History className="w-4 h-4 mr-2" />
              Version History
            </Button>
          </div>
        </Card>

      </div>
    </aside>
  );
};