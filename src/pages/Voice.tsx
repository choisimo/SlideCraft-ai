import { AppShell } from "@/components/AppShell";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AIStatusBar } from "@/components/AIStatusBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { useVoice } from "@/hooks/useVoice";

export default function VoicePage() {
  const { recording, blob, start, stop } = useVoice();
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && blob) {
      audioRef.current.src = URL.createObjectURL(blob);
    }
  }, [blob]);

  return (
    <AppShell header={<Header documentTitle="음성" />} sidebar={<AppSidebar />} footer={<AIStatusBar />}>
      <div className="py-6 space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            {!recording ? (
              <Button onClick={start}>녹음 시작</Button>
            ) : (
              <Button variant="destructive" onClick={stop}>녹음 종료</Button>
            )}
            <audio ref={audioRef} controls />
          </div>
        </Card>
        <Card className="p-4 text-sm text-muted-foreground">
          음성 인식/자막/요약 등 AI 처리는 백엔드 연동 시 추가됩니다. 현재는 녹음/재생 UI만 제공합니다.
        </Card>
      </div>
    </AppShell>
  );
}
