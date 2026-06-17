export type LandingFeatureId =
  | "chat-plan"
  | "reasoning-trace"
  | "rag-knowledge"
  | "skills-tools";

export interface LandingFeatureSection {
  id: LandingFeatureId;
  badge: string;
  title: string;
  description: string;
  bullets: string[];
  accent: "emerald" | "teal" | "sky" | "amber";
}

export const LANDING_FEATURE_SECTIONS: LandingFeatureSection[] = [
  {
    id: "chat-plan",
    badge: "对话规划",
    title: "自然语言生成全程出行方案",
    description:
      "描述目的地与偏好，Agent 自动选择全量规划、增量修订或快答模式，右侧同步展示 Markdown 行程。",
    bullets: ["多轮对话保留上下文", "按天行程与预算建议", "支持局部修订而不推倒重来"],
    accent: "emerald",
  },
  {
    id: "reasoning-trace",
    badge: "推理可视",
    title: "全链路推理轨迹一目了然",
    description:
      "从运行模式路由、工具调用到知识检索，事件按序呈现，便于结果复核。",
    bullets: ["run_mode / tool_call 事件", "RAG 检索来源可追溯", "失败时可查看自修正过程"],
    accent: "teal",
  },
  {
    id: "rag-knowledge",
    badge: "知识增强",
    title: "内置 55 城攻略 + 自定义上传",
    description:
      "混合检索 Wikivoyage 内置库与您上传的 Markdown 攻略，回答自动附带可解析出处标记。",
    bullets: ["关键词 + 向量混合检索", "本地打包城市文档", "设置页检索预览与上传"],
    accent: "sky",
  },
  {
    id: "skills-tools",
    badge: "Skill & 工具",
    title: "浪漫出行 Skill 与真实 API 工具",
    description:
      "勾选情侣浪漫、亲子慢游等 Skill 定制语气与结构；天气、路线、POI、铁路提示按需调用。",
    bullets: ["内置 + 用户自定义 Skill", "工具开关与参数校验", "长期记忆跨对话共享"],
    accent: "amber",
  },
];
