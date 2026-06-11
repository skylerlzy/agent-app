import { ToolsPanel } from "@/components/settings/ToolsPanel";
import { SettingsLayout } from "@/components/settings/SettingsLayout";

export default function ToolsSettingsPage() {
  return (
    <SettingsLayout
      title="工具管理"
      description="启用或禁用 Agent 可调用的出行工具，并查看 API Key 配置状态。"
    >
      <ToolsPanel />
    </SettingsLayout>
  );
}
