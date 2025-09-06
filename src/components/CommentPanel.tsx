import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Plus, 
  MoreHorizontal,
  Check,
  Clock
} from "lucide-react";

interface Comment {
  id: string;
  author: {
    name: string;
    avatar?: string;
  };
  content: string;
  timestamp: string;
  status: "open" | "resolved";
  replies?: Comment[];
}

interface CommentPanelProps {
  comments?: Comment[];
  onAddComment?: () => void;
}

export const CommentPanel = ({ 
  comments = [], 
  onAddComment 
}: CommentPanelProps) => {
  return (
    <div className="w-80 border-l border-border bg-background/50 backdrop-blur-sm h-full flex flex-col">
      
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Comments</h3>
            <Badge variant="outline" className="text-xs">
              {comments.filter(c => c.status === "open").length}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onAddComment}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {comments.map((comment) => (
          <Card key={comment.id} className="p-4 space-y-3">
            
            {/* Comment Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={comment.author.avatar} alt={comment.author.name} />
                  <AvatarFallback className="text-xs">
                    {comment.author.name.split(" ").map(n => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {comment.author.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {comment.timestamp}
                    </p>
                    {comment.status === "resolved" ? (
                      <Badge variant="outline" className="text-xs bg-success-light text-success">
                        <Check className="w-3 h-3 mr-1" />
                        Resolved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-warning-light text-warning">
                        <Clock className="w-3 h-3 mr-1" />
                        Open
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="w-6 h-6">
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </div>

            {/* Comment Content */}
            <p className="text-sm text-foreground leading-relaxed">
              {comment.content}
            </p>

            {/* Comment Actions */}
            <div className="flex items-center gap-2 pt-2">
              {comment.status === "open" && (
                <Button variant="outline" size="sm" className="text-xs">
                  Reply
                </Button>
              )}
              {comment.status === "open" && (
                <Button variant="ghost" size="sm" className="text-xs text-success">
                  <Check className="w-3 h-3 mr-1" />
                  Resolve
                </Button>
              )}
            </div>

          </Card>
        ))}

        {/* Empty State */}
        {comments.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <h4 className="font-medium text-foreground">No comments yet</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Start a conversation by adding the first comment
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onAddComment}>
              Add Comment
            </Button>
          </div>
        )}
      </div>

      {/* Quick Add Comment */}
      <div className="p-4 border-t border-border">
        <Button variant="outline" size="sm" className="w-full" onClick={onAddComment}>
          <Plus className="w-4 h-4 mr-2" />
          Add Comment
        </Button>
      </div>

    </div>
  );
};