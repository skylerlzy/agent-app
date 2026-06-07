import type { UserMemory } from "../contracts";

export type MemoryKind = UserMemory["kind"];

export interface MemoryCandidate {
  kind: MemoryKind;
  content: string;
}

function cleanSentence(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[。.!！?？]+$/g, "").trim();
}

function pushUnique(items: MemoryCandidate[], item: MemoryCandidate) {
  const content = cleanSentence(item.content);
  if (content.length < 3 || content.length > 180) return;
  if (items.some((x) => x.kind === item.kind && x.content === content)) return;
  items.push({ kind: item.kind, content });
}

function extractBudget(text: string, items: MemoryCandidate[]) {
  const m = text.match(/(?:预算|人均|总预算)[^\d]{0,8}(\d{3,6})\s*(?:元|块|rmb|人民币)?/i);
  if (!m) return;
  pushUnique(items, {
    kind: "constraint",
    content: `用户出行预算约为 ${m[1]} 元。`,
  });
}

function extractDiet(text: string, items: MemoryCandidate[]) {
  const patterns: Array<[RegExp, string]> = [
    [/(?:我|我们|本人)?(?:不吃|不能吃|忌口|不要吃|不太能吃)\s*([^，。；;,.!?！？]{1,20})/, "constraint"],
    [/(?:我|我们|本人)?(?:喜欢吃|爱吃|偏好)\s*([^，。；;,.!?！？]{1,24})/, "preference"],
    [/(?:素食|吃素|清真|halal)/i, "constraint"],
  ];

  for (const [pattern, kind] of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    const content = m[1]
      ? `用户${kind === "constraint" ? "不适合或不希望" : "偏好"}${m[1]}。`
      : "用户有特殊饮食约束。";
    pushUnique(items, { kind: kind as MemoryKind, content });
  }
}

function extractPreference(text: string, items: MemoryCandidate[]) {
  const m = text.match(/(?:我|我们|本人)?(?:喜欢|偏好|更想|希望|倾向于)\s*([^，。；;,.!?！？]{2,40})/);
  if (!m) return;
  pushUnique(items, {
    kind: "preference",
    content: `用户偏好${m[1]}。`,
  });
}

function extractTravelConstraint(text: string, items: MemoryCandidate[]) {
  const m = text.match(/(?:不要|不想|避免|尽量少|不能|必须|一定要)\s*([^，。；;,.!?！？]{2,48})/);
  if (!m) return;
  pushUnique(items, {
    kind: "constraint",
    content: `用户约束：${cleanSentence(m[0])}。`,
  });
}

function extractFact(text: string, items: MemoryCandidate[]) {
  const patterns = [
    /(?:我|我们|本人)(?:住在|来自|常住|在)\s*([^，。；;,.!?！？]{2,30})/,
    /(?:带|同行)(?:老人|小孩|孩子|父母|家人|朋友|同事)/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    pushUnique(items, {
      kind: "fact",
      content: `用户事实：${cleanSentence(m[0])}。`,
    });
  }
}

export function extractMemoryCandidates(input: {
  userMessage: string;
  assistantReply?: string;
}): MemoryCandidate[] {
  const text = cleanSentence(input.userMessage);
  if (!text) return [];

  const items: MemoryCandidate[] = [];
  extractBudget(text, items);
  extractDiet(text, items);
  extractPreference(text, items);
  extractTravelConstraint(text, items);
  extractFact(text, items);

  return items.slice(0, 6);
}
