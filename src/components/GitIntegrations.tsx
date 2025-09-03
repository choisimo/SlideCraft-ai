import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  GitBranch, 
  Plus, 
  ExternalLink,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@supabase/supabase-js";

interface GitIntegration {
  id: string;
  repository_name: string;
  repository_full_name: string;
  repository_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GitOperation {
  id: string;
  operation_type: string;
  status: string;
  commit_message?: string;
  file_path: string;
  created_at: string;
  error_message?: string;
}

interface GitIntegrationsProps {
  session?: Session;
}

export const GitIntegrations = ({ session }: GitIntegrationsProps = {}) => {
  const [integrations, setIntegrations] = useState<GitIntegration[]>([]);
  const [operations, setOperations] = useState<GitOperation[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchIntegrations();
    fetchOperations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from("github_integrations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setIntegrations(data || []);
    } catch (error) {
      toast({
        title: "Error fetching integrations",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOperations = async () => {
    try {
      const { data, error } = await supabase
        .from("git_operations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setOperations(data || []);
    } catch (error) {
      console.error("Error fetching operations:", error);
    }
  };

  const addIntegration = async () => {
    if (!repoUrl.trim() || !session?.user?.id) return;

    try {
      // Extract repo info from URL
      const urlParts = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!urlParts) {
        toast({
          title: "Invalid GitHub URL",
          description: "Please enter a valid GitHub repository URL",
          variant: "destructive",
        });
        return;
      }

      const [, owner, repo] = urlParts;
      const repositoryName = repo.replace(/\.git$/, "");
      const repositoryFullName = `${owner}/${repositoryName}`;

      const { error } = await supabase
        .from("github_integrations")
        .insert({
          repository_name: repositoryName,
          repository_full_name: repositoryFullName,
          repository_url: repoUrl,
          installation_id: "manual", // For demo purposes
          user_id: session.user.id,
        });

      if (error) throw error;

      toast({
        title: "Integration added",
        description: `Successfully added ${repositoryFullName}`,
      });

      setRepoUrl("");
      fetchIntegrations();
    } catch (error) {
      toast({
        title: "Error adding integration",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <RefreshCw className="h-4 w-4 text-blue-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">Git Integrations</h2>
        <p className="text-muted-foreground">
          Connect repositories to enable automatic documentation updates
        </p>
      </div>

      {/* Add Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Add Repository</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-3">
            <Input
              placeholder="https://github.com/username/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addIntegration} disabled={!repoUrl.trim()}>
              <GitBranch className="h-4 w-4 mr-2" />
              Connect
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connected Repositories */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Repositories ({integrations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {integrations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No repositories connected yet</p>
              <p className="text-sm">Add a GitHub repository to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">{integration.repository_full_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Added {new Date(integration.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Badge variant={integration.is_active ? "default" : "secondary"}>
                      {integration.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={integration.repository_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Operations */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Git Operations</CardTitle>
        </CardHeader>
        <CardContent>
          {operations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No operations yet</p>
              <p className="text-sm">Operations will appear here when repositories are active</p>
            </div>
          ) : (
            <div className="space-y-3">
              {operations.map((operation) => (
                <div
                  key={operation.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(operation.status)}
                    <div>
                      <p className="font-medium text-sm">
                        {operation.operation_type} - {operation.file_path}
                      </p>
                      {operation.commit_message && (
                        <p className="text-xs text-muted-foreground">
                          "{operation.commit_message}"
                        </p>
                      )}
                      {operation.error_message && (
                        <p className="text-xs text-red-600">
                          Error: {operation.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <Badge variant="outline" className="text-xs">
                    {operation.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};