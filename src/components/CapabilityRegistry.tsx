import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  Code, 
  FileText, 
  Image,
  Zap,
  Plus,
  CheckCircle,
  AlertCircle,
  Clock
} from "lucide-react";

interface Capability {
  id: string;
  name: string;
  description: string;
  category: "core" | "generated" | "experimental";
  status: "active" | "learning" | "error";
  lastUsed?: Date;
  usageCount: number;
  dependencies: string[];
}

export const CapabilityRegistry = () => {
  const [capabilities] = useState<Capability[]>([
    {
      id: "1",
      name: "summarize_text",
      description: "Extracts key information from large text documents and creates concise summaries",
      category: "core",
      status: "active",
      lastUsed: new Date(),
      usageCount: 47,
      dependencies: ["openai", "text-processing"]
    },
    {
      id: "2",
      name: "generate_html",
      description: "Converts structured data and text into formatted HTML documents",
      category: "core",
      status: "active",
      lastUsed: new Date(Date.now() - 3600000),
      usageCount: 23,
      dependencies: ["html-templates", "css-styling"]
    },
    {
      id: "3",
      name: "convert_to_ppt",
      description: "Creates PowerPoint presentations from structured content",
      category: "generated",
      status: "active",
      lastUsed: new Date(Date.now() - 86400000),
      usageCount: 12,
      dependencies: ["python-pptx", "template-engine"]
    },
    {
      id: "4",
      name: "analyze_code_complexity",
      description: "Analyzes code structure and provides complexity metrics",
      category: "experimental",
      status: "learning",
      lastUsed: new Date(Date.now() - 172800000),
      usageCount: 3,
      dependencies: ["ast-parser", "complexity-metrics"]
    },
    {
      id: "5",
      name: "generate_pdf_reports",
      description: "Creates comprehensive PDF reports from multiple data sources",
      category: "generated",
      status: "error",
      usageCount: 0,
      dependencies: ["weasyprint", "report-templates"]
    }
  ]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "core": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "generated": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "experimental": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "learning": return <Clock className="h-4 w-4 text-yellow-600" />;
      case "error": return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const getCategoryIcon = (name: string) => {
    if (name.includes("text") || name.includes("summarize")) return <FileText className="h-4 w-4" />;
    if (name.includes("html") || name.includes("ppt") || name.includes("pdf")) return <FileText className="h-4 w-4" />;
    if (name.includes("code") || name.includes("analyze")) return <Code className="h-4 w-4" />;
    if (name.includes("image") || name.includes("visual")) return <Image className="h-4 w-4" />;
    return <Brain className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Capability Registry</h2>
        <Button className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Request New Capability</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{capabilities.length}</p>
                <p className="text-sm text-muted-foreground">Total Capabilities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">
                  {capabilities.filter(c => c.status === "active").length}
                </p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">
                  {capabilities.filter(c => c.category === "generated").length}
                </p>
                <p className="text-sm text-muted-foreground">Self-Generated</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">
                  {capabilities.filter(c => c.status === "learning").length}
                </p>
                <p className="text-sm text-muted-foreground">Learning</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capabilities List */}
      <Card>
        <CardHeader>
          <CardTitle>Available Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {capabilities.map((capability) => (
              <div
                key={capability.id}
                className="flex items-start justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-muted rounded-lg">
                    {getCategoryIcon(capability.name)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-medium">{capability.name}</h3>
                      {getStatusIcon(capability.status)}
                      <Badge className={getCategoryColor(capability.category)}>
                        {capability.category}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">
                      {capability.description}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>Used {capability.usageCount} times</span>
                      {capability.lastUsed && (
                        <span>Last used: {capability.lastUsed.toLocaleDateString()}</span>
                      )}
                    </div>
                    
                    <div className="mt-2 flex flex-wrap gap-1">
                      {capability.dependencies.map((dep, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {dep}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm">
                    View Code
                  </Button>
                  {capability.status === "error" && (
                    <Button variant="outline" size="sm">
                      Debug
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};