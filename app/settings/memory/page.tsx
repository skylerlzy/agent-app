"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { MemoryPanel } from "@/components/settings/MemoryPanel";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";

export default function MemorySettingsPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="mx-auto max-w-lg px-4 py-16">
          <GlassCard className="cursor-default border-dashed">
            <CardHeader>
              <CardTitle className="text-base">登录后管理长期记忆</CardTitle>
              <CardDescription>跨对话知识共享需要绑定到当前用户身份。</CardDescription>
            </CardHeader>
            <CardContent>
              <SignInButton mode="modal">
                <Button type="button" className="cursor-pointer">
                  登录
                </Button>
              </SignInButton>
            </CardContent>
          </GlassCard>
        </main>
      </Show>

      <Show when="signed-in">
        <SettingsLayout
          title="长期记忆"
          description="管理 Agent 可跨对话复用的用户偏好、事实和约束。"
        >
          <MemoryPanel />
        </SettingsLayout>
      </Show>
    </>
  );
}
