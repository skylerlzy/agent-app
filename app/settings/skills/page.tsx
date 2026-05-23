"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { SkillsPanel } from "@/components/settings/SkillsPanel";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";

export default function SkillsSettingsPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="mx-auto max-w-lg px-4 py-16">
          <GlassCard className="cursor-default border-dashed">
            <CardHeader>
              <CardTitle className="text-base">登录后管理 Skill</CardTitle>
              <CardDescription>上传与管理自定义出行 Skill 需要先登录。</CardDescription>
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
          title="Skill 管理"
          description="上传 Anthropic 格式 SKILL.md，为 Agent 附加领域出行指引；内置 Skill 可直接启用。"
        >
          <SkillsPanel />
        </SettingsLayout>
      </Show>
    </>
  );
}
