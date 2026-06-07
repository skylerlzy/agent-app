"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { KnowledgePanel } from "@/components/settings/KnowledgePanel";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";

export default function KnowledgeSettingsPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="mx-auto max-w-lg px-4 py-16">
          <GlassCard className="cursor-default border-dashed">
            <CardHeader>
              <CardTitle className="text-base">登录后管理知识库</CardTitle>
              <CardDescription>上传攻略和 RAG 检索需要绑定到当前用户身份。</CardDescription>
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
          title="知识库"
          description="上传攻略文档并预览检索片段，Agent 回答会带可解析来源标记。"
        >
          <KnowledgePanel />
        </SettingsLayout>
      </Show>
    </>
  );
}
