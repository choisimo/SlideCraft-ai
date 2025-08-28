import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const SettingsPage = () => {
  return (
    <AppShell header={<Header documentTitle="설정" />} sidebar={<AppSidebar />} footer={<AIStatusBar aiStatus={{stage:"대기",progress:0,status:"idle",details:"",collaborators:0}} autoSaveStatus="" /> }>
      <div className="py-6 space-y-6">
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>언어</Label>
            <Select defaultValue="ko">
              <SelectTrigger className="w-56"><SelectValue placeholder="언어 선택"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">한국어</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>테마</Label>
            <Select defaultValue="light">
              <SelectTrigger className="w-56"><SelectValue placeholder="테마 선택"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">라이트</SelectItem>
                <SelectItem value="dark">다크</SelectItem>
                <SelectItem value="system">시스템</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>
    </AppShell>
  );
};

export default SettingsPage;
