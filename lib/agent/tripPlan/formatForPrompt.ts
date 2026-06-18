import type { TripPlanDocument } from "./types";

/** 将结构化方案压缩为 LLM 上下文（quick_reply / incremental_revise） */
export function formatTripPlanForPrompt(doc: TripPlanDocument, maxChars = 12000): string {
  const lines: string[] = [
    `【行程总览】${doc.overview}`,
    `【天气与着装】${doc.weatherTips}`,
    `【交通】${doc.transport}`,
    `【主题与景点】${doc.themesAndPlaces.join("；") || "—"}`,
  ];

  for (const day of doc.itinerary) {
    lines.push(`\n### ${day.title}${day.dateIso ? ` (${day.dateIso})` : ""}`);
    const slots = [
      ["上午", day.activities.morning],
      ["下午", day.activities.afternoon],
      ["晚上", day.activities.evening],
    ] as const;
    for (const [label, acts] of slots) {
      if (!acts.length) continue;
      lines.push(
        `${label}：${acts.map((a) => `${a.itineraryItem}（${a.briefDescription}）`).join("；")}`
      );
    }
  }

  lines.push(`\n【饮食与预算】${doc.foodAndBudget}`);
  lines.push(`【提示与免责】${doc.tipsAndDisclaimer}`);
  if (doc.citations?.length) {
    lines.push(`【知识来源】${doc.citations.join("；")}`);
  }

  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
