import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  Bot, 
  User, 
  FileText, 
  Download,
  Cpu,
  Zap
} from "lucide-react";

interface Message {
  id: string;
  type: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  status?: "processing" | "completed" | "error";
  attachments?: {
    type: "file" | "download";
    name: string;
    url?: string;
  }[];
}

export const AIAgent = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "system",
      content: "Auto-Doc AI Agent initialized. I can help you with document generation, code analysis, and project documentation. What would you like me to do?",
      timestamp: new Date(),
      status: "completed"
    }
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    // Simulate AI processing
    setTimeout(() => {
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "agent",
        content: `I understand you want me to: "${input}". Let me analyze this request and determine the best approach. I'll check my capabilities registry and create a plan to fulfill your request.`,
        timestamp: new Date(),
        status: "completed",
        attachments: input.toLowerCase().includes("ppt") || input.toLowerCase().includes("pdf") ? [
          {
            type: "download",
            name: "generated_document.ppt",
            url: "#"
          }
        ] : undefined
      };

      setMessages(prev => [...prev, agentMessage]);
      setIsProcessing(false);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Agent Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-primary" />
            <span>AI Agent Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" className="flex items-center space-x-1">
              <Cpu className="h-3 w-3" />
              <span>Active</span>
            </Badge>
            <Badge variant="outline" className="flex items-center space-x-1">
              <Zap className="h-3 w-3" />
              <span>Self-Evolving Mode</span>
            </Badge>
            <span className="text-sm text-muted-foreground">
              Ready to process requests and evolve capabilities
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Chat Interface */}
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>Chat with AI Agent</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col space-y-4">
          {/* Messages */}
          <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start space-x-3 ${
                    message.type === "user" ? "flex-row-reverse space-x-reverse" : ""
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    message.type === "user" 
                      ? "bg-primary text-primary-foreground"
                      : message.type === "agent"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {message.type === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  
                  <div className={`flex-1 ${
                    message.type === "user" ? "text-right" : ""
                  }`}>
                    <div className={`inline-block p-3 rounded-lg max-w-[80%] ${
                      message.type === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      <p className="text-sm">{message.content}</p>
                      
                      {/* Attachments */}
                      {message.attachments && (
                        <div className="mt-2 space-y-2">
                          {message.attachments.map((attachment, index) => (
                            <div
                              key={index}
                              className="flex items-center space-x-2 p-2 bg-background/50 rounded border"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="text-xs font-medium">{attachment.name}</span>
                              <Button size="sm" variant="outline">
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-full bg-accent text-accent-foreground">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="inline-block p-3 rounded-lg bg-muted">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                        <span className="text-sm">AI is processing your request...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="flex items-center space-x-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me to analyze code, generate documents, create PPTs..."
              className="flex-1"
              disabled={isProcessing}
            />
            <Button 
              onClick={handleSendMessage}
              disabled={!input.trim() || isProcessing}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};