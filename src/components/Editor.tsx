import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Type, 
  Image, 
  Shapes, 
  Palette,
  MousePointer
} from "lucide-react";
import { useState } from "react";

interface EditorProps {
  currentSlide?: number;
  totalSlides?: number;
}

export const Editor = ({ currentSlide = 1, totalSlides = 5 }: EditorProps) => {
  const [selectedTool, setSelectedTool] = useState<string>("select");

  const tools = [
    { id: "select", icon: MousePointer, label: "Select" },
    { id: "text", icon: Type, label: "Text" },
    { id: "image", icon: Image, label: "Image" },
    { id: "shapes", icon: Shapes, label: "Shapes" },
    { id: "colors", icon: Palette, label: "Colors" },
  ];

  return (
    <div className="flex-1 flex flex-col bg-muted/30">
      
      {/* Toolbar */}
      <div className="border-b border-border bg-background p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tools.map((tool) => (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedTool(tool.id)}
                className="flex items-center gap-2"
              >
                <tool.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tool.label}</span>
              </Button>
            ))}
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Slide {currentSlide} of {totalSlides}
            </span>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Slide
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 p-8 flex items-center justify-center">
        <Card className="w-full max-w-4xl aspect-[16/9] bg-white shadow-lg border-2 border-border relative overflow-hidden">
          
          {/* Slide Content */}
          <div className="p-12 h-full flex flex-col justify-center space-y-8">
            
            {/* Title */}
            <div className="text-center space-y-4">
               <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                Slide
               </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                 
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-3 gap-6 mt-12">
               <div className="text-center space-y-2">
                <div className="w-12 h-12 gradient-primary rounded-lg mx-auto flex items-center justify-center">
                  <Type className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Import</h3>
                <p className="text-sm text-gray-600"></p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 gradient-primary rounded-lg mx-auto flex items-center justify-center">
                  <MousePointer className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Collaboration</h3>
                <p className="text-sm text-gray-600"></p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 gradient-primary rounded-lg mx-auto flex items-center justify-center">
                  <Shapes className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Enhancement</h3>
                <p className="text-sm text-gray-600"></p>
              </div>
            </div>

          </div>

          {/* Real-time Cursor Indicators */}
          <div className="absolute top-16 left-16">
            <div className="flex items-center gap-2 bg-primary text-white px-2 py-1 rounded-md text-xs font-medium">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              You
            </div>
          </div>

          <div className="absolute bottom-20 right-20">
            <div className="flex items-center gap-2 bg-secondary text-white px-2 py-1 rounded-md text-xs font-medium">
              <div className="w-2 h-2 bg-white rounded-full"></div>
               Collaborator is editing...
            </div>
          </div>

        </Card>
      </div>

      {/* Status Bar */}
      <div className="border-t border-border bg-background/50 px-6 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Auto-saved</span>
              <span>•</span>
              <span>Collaborators</span>
            </div>
          <div className="flex items-center gap-4">
            <span>Zoom: 100%</span>
            <span>•</span>
            <span>16:9 ratio</span>
          </div>
        </div>
      </div>

    </div>
  );
};