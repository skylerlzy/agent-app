import type { TripPlanFoodRecommendation } from "./types";

const ENRICH_MARKER = /适合作为行程中的暖胃一站|建议错峰到店少排队|口碑门店，适合逛完景点/;

function dedupeSentences(text: string): string {
  const parts = text
    .split(/[。；;]/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.replace(/\s+/gu, "").slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.length ? `${out.join("。")}。` : text.trim();
}

/** 根据店名/类型生成一次性的生动介绍（幂等，不叠加重复句） */
export function buildFoodDescription(input: {
  name: string;
  address?: string;
  poiType?: string;
  tel?: string;
}): string {
  const { name, address, poiType, tel } = input;
  const blob = `${name}${poiType ?? ""}${address ?? ""}`;

  let hook = "";
  if (/烤鸭|烧鹅|烤禽|北京菜/i.test(blob)) {
    hook = "片皮蘸酱、卷进葱丝，一口下去是旅途里最像样的犒赏";
  } else if (/涮肉|火锅|铜锅/i.test(blob)) {
    hook = "铜锅咕嘟、肉香升腾，适合三五好友分享的热闹一顿";
  } else if (/小吃|夜市|胡同|南锣鼓巷|大栅栏|前门/i.test(blob)) {
    hook = "边走边吃最入戏，挑一两样招牌，把市井烟火气吃进记忆里";
  } else if (/清真|halal/i.test(blob)) {
    hook = "口味稳妥、选择清晰，穆斯林或偏好清淡蛋白的旅人也吃得安心";
  } else if (/咖啡|烘焙|轻食|甜品/i.test(blob)) {
    hook = "逛累了一杯好咖啡或一块甜点，给行程按下慢放键";
  } else if (/博物馆|皇家|御仙|宫廷/i.test(blob)) {
    hook = "环境自带故事感，把参观延伸成一顿有仪式感的饭局";
  } else if (/王府井|三里屯|太古里|商圈/i.test(blob)) {
    hook = "商圈里人气很旺的一站，傍晚到店，灯光与食欲一起亮起来";
  } else if (/紫光园|老字号/i.test(blob)) {
    hook = "本地老牌连锁，菜单稳妥、出餐快，适合不想踩雷的正餐";
  } else {
    hook = "附近口碑不错的选择，逛完景点就近坐下，把胃和心情都安顿好";
  }

  const detailParts: string[] = [hook];
  if (address) detailParts.push(`地址 ${address}`);
  if (tel) detailParts.push(`可致电 ${tel} 确认排队情况`);
  else detailParts.push("建议错峰到店，先点招牌再慢慢加菜");

  return dedupeSentences(detailParts.join("。"));
}

/** 从已有 description 解析地址片段（避免重复 enrich） */
function parseAddressFromDescription(desc: string): string | undefined {
  const m = desc.match(/([^·]+(?:路|街|巷|号|层|座|弄|里|大道|大街)[^·]*)/u);
  return m?.[1]?.trim();
}

export function composeFoodRecommendation(input: {
  name: string;
  description?: string;
  address?: string;
  poiType?: string;
  tel?: string;
}): TripPlanFoodRecommendation {
  if (input.description && !ENRICH_MARKER.test(input.description)) {
    const cleaned = dedupeSentences(input.description);
    if (cleaned.length > 24 && !/^[^。]+ · [^。]+ · 适合作为/.test(cleaned)) {
      return { name: input.name, description: cleaned };
    }
  }

  const address =
    input.address?.trim() ||
    (input.description ? parseAddressFromDescription(input.description) : undefined);
  const typeMatch = input.description?.split(" · ").find((p) => /餐|菜|馆|酒楼|小吃/i.test(p));
  const tel =
    input.tel?.trim() ||
    input.description?.match(/电话\s*([\d-]+)/u)?.[1]?.trim();

  return {
    name: input.name,
    description: buildFoodDescription({
      name: input.name,
      address,
      poiType: input.poiType ?? typeMatch,
      tel: input.tel,
    }),
  };
}

export function buildFoodBudgetSummary(opts: {
  destination?: string;
  budgetCny?: number;
  dietaryPreset?: string;
  restaurants?: Array<{ name: string; description?: string }>;
}): string {
  const dest = (opts.destination || "当地").replace(/市$/u, "");
  const clauses: string[] = [];

  if (opts.dietaryPreset && opts.dietaryPreset !== "none") {
    const label =
      opts.dietaryPreset === "halal"
        ? "清真友好"
        : opts.dietaryPreset === "vegetarian"
          ? "素食"
          : opts.dietaryPreset === "local"
            ? "本地风味"
            : "饮食偏好";
    clauses.push(`已按${label}方向筛选`);
  }
  if (opts.budgetCny != null && opts.budgetCny > 0) {
    clauses.push(`人均参考约 ${opts.budgetCny} 元/天`);
  }

  const named = (opts.restaurants ?? []).filter((r) => r.name?.trim()).slice(0, 4);
  if (named.length >= 2) {
    const list = named.map((r) => `「${r.name}」`).join("、");
    clauses.push(`推荐试吃 ${list}；下列卡片含地址与电话，到店前可确认营业`);
    return `${dest}用餐参考：${clauses.join("，")}。`;
  }

  clauses.push("下列门店来自本轮 POI 检索，到店前可电话确认营业时间与是否合口味");
  return `${dest}用餐参考：${clauses.join("，")}。`;
}
