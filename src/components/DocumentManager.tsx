import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  File, 
  Download,
  Search,
  Plus,
  Eye,
  Trash2
} from "lucide-react";

interface Document {
  id: string;
  name: string;
  type: "project" | "generated" | "source";
  format: "md" | "pdf" | "ppt" | "html" | "txt";
  size: string;
  lastModified: Date;
  status: "active" | "processing" | "archived";
}

export const DocumentManager = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [documents] = useState<Document[]>([
    {
      id: "1",
      name: "Project Overview",
      type: "project",
      format: "md",
      size: "2.4 KB",
      lastModified: new Date(),
      status: "active"
    },
    {
      id: "2", 
      name: "API Documentation",
      type: "generated",
      format: "html",
      size: "15.2 KB",
      lastModified: new Date(Date.now() - 86400000),
      status: "active"
    },
    {
      id: "3",
      name: "Technical Specification",
      type: "generated", 
      format: "pdf",
      size: "847 KB",
      lastModified: new Date(Date.now() - 172800000),
      status: "active"
    }
  ]);

  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeColor = (type: string) => {
    switch (type) {
      case "project": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "generated": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "source": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case "pdf": return "🗎";
      case "ppt": return "🎞";
      case "html": return "🌐";
      case "md": return "📝";
      default: return "📄";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Document Manager</h2>
        <Button className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>New Document</span>
        </Button>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>Upload Documents</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Upload project files</p>
            <p className="text-muted-foreground mb-4">
              Drag and drop files or click to browse. Supported formats: PDF, MD, TXT, HTML
            </p>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Choose Files
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Documents ({filteredDocuments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="text-2xl">{getFormatIcon(doc.format)}</div>
                  <div>
                    <h3 className="font-medium">{doc.name}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge className={getTypeColor(doc.type)}>
                        {doc.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {doc.size} • {doc.lastModified.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};