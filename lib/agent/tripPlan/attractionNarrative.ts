import type { CuratedAttraction } from "./types";

export type AttractionSpotlight = {
  tagline: string;
  experience: string;
  tips: string[];
};

/** 根据 POI 名称/类型推断通用游览叙事（诗意 + 生活化，不绑定具体城市） */
export function describeAttractionSpotlight(place: CuratedAttraction): AttractionSpotlight {
  const name = place.name;
  const type = place.poiType ?? "";
  const blob = `${name}${type}${place.searchKeywords ?? ""}`;

  if (/陵|墓|纪念堂|祭堂|中山陵|明十三陵/i.test(blob)) {
    return {
      tagline: "拾级而上，在庄严与静默里读懂一段近代记忆",
      experience:
        "沿主轴线缓步向上，梧桐或松柏夹道；不必赶时间，在祭堂前留几分钟，风与历史会替你说完剩下的句子。",
      tips: ["建议预约或错峰入园", "穿舒适步行鞋，台阶较多", "保持安静与肃穆"],
    };
  }
  if (/夫子庙|秦淮|河街|老街|步行街|商业区|风光带/i.test(blob)) {
    return {
      tagline: "华灯初上，河风与市声把夜晚酿成一碗热汤",
      experience:
        "先沿河畔或主街慢行，看灯影落水；再找一家看得见人间烟火的店，把口味与对话都放慢半拍。",
      tips: ["傍晚至夜间氛围最佳", "节假日人流大，错峰更轻松", "留意游船与步行动线"],
    };
  }
  if (/艺术区|创意园|文创|798/i.test(blob)) {
    return {
      tagline: "老厂房与涂鸦墙之间，藏着一座城市最自由的文艺心跳",
      experience:
        "把下午交给漫游就好：钻进一家独立画廊，再在街角咖啡馆等日落把红砖染成金红色。",
      tips: ["平底鞋比高跟鞋更搭这里", "留意限时展海报", "留 2～3 小时完全不赶"],
    };
  }
  if (
    /(公园|湖|海|湿地|森林|草原|玄武湖|西湖|东湖|颐和园|植物园)/i.test(name) &&
    !/博物馆/i.test(name) &&
    !/陵|纪念/i.test(name)
  ) {
    return {
      tagline: "山水与林风作伴，适合把时钟调慢半格",
      experience:
        "沿主路或湖岸慢行，找一处树荫或水边长椅发呆，比打卡十张合影更像旅行。",
      tips: ["备水、防晒、舒适鞋", "热门季节建议开园即入", "午后可在园内茶室歇脚"],
    };
  }
  if (/天坛|寺|庙|观|塔/i.test(name) && !/夫子庙|商业街|步行街/i.test(name)) {
    return {
      tagline: "晨钟暮鼓里，感受东方礼制与建筑的对称之美",
      experience:
        "沿中轴线缓步向上，听风穿过檐角；若遇讲解，不妨驻足三分钟，历史会自己开口。",
      tips: ["尊重参观礼仪", "上午光线与体感更舒适", "预留约 2 小时"],
    };
  }
  if (/故宫|古城|城墙|遗址|陵|王府|胡同/i.test(blob) || /世界遗产.*风景名胜/i.test(type)) {
    return {
      tagline: "砖石之间走着几百年的故事，适合沉浸式慢游",
      experience:
        "别急着走完所有殿宇——选 2～3 条动线深看，留一段空白给角楼、红墙与偶然遇见的讲解。",
      tips: ["热门时段务必提前预约", "穿轻便鞋，背包寄存有备无患", "可与周边胡同串联成一日"],
    };
  }
  if (/博物馆|纪念馆|陈列/i.test(blob) && !/风景名胜/i.test(type)) {
    return {
      tagline: "晴雨皆宜的室内旅程，把一段历史收进眼里",
      experience:
        "直奔常设展与镇馆之宝，再挑一个最感兴趣的专题慢慢看；累了就在中庭发会儿呆。",
      tips: ["查闭馆日与最后入场", "大包寄存更轻松", "2～3 小时刚刚好"],
    };
  }
  if (/美术馆|艺术馆/i.test(blob)) {
    return {
      tagline: "安静展厅里，与作品独处的一两个小时最珍贵",
      experience: "按展厅顺序逛，看到心动的多停一分钟；文创店的小物件有时比照片更耐看。",
      tips: ["特展可能另购票", "保持低音量", "适合下午或雨日"],
    };
  }
  if (/商场|太古里|步行街|坊|商业街/i.test(blob)) {
    return {
      tagline: "霓虹、音乐与美食交织，适合把夜晚交给城市",
      experience: "先逛主街感受氛围，再拐进小巷找一家顺眼的店坐下——旅行的一半是逛，一半是吃。",
      tips: ["节假日人流大，错峰更轻松", "理性消费", "与当日景点就近串联"],
    };
  }
  if (/广场|门|大街/i.test(name)) {
    return {
      tagline: "城市名片级的开场或收尾，一站收尽天际线与人间烟火",
      experience: "清晨或傍晚光线最温柔，顺路串联周边历史街区，比 midday 暴晒更舒服。",
      tips: ["高峰时段注意随身物品", "拍照留 15 分钟就够", "适合作为一日动线锚点"],
    };
  }
  if (place.category === "cultural") {
    return {
      tagline: "人文厚度藏在细节里，值得用半日认真读完",
      experience: "选 1～2 个重点区域深看，中途用一杯茶或本地小吃把节奏拉回生活。",
      tips: ["热门季提前购票", "尊重当地习俗", "别排太满，留白也是风景"],
    };
  }
  return {
    tagline: "当地生活与风景交汇的一处，值得写进你的私藏路线",
    experience: "对照开放时间灵活安排，与相邻景点步行串联，把意外遇见当作额外彩蛋。",
    tips: ["出发前确认开放信息", "控制步行强度", "留时间给拍照与休息"],
  };
}

export function describeActivityForSlot(
  place: CuratedAttraction,
  slot: "morning" | "afternoon" | "evening",
  role: "main" | "companion" | "indoor-fallback" | "evening-stroll"
): string {
  const spot = describeAttractionSpotlight(place);
  const timeWord =
    slot === "morning" ? "上午" : slot === "afternoon" ? "下午" : "傍晚";

  const lead =
    role === "main"
      ? `${timeWord}把 ${place.name} 当作一日主角`
      : role === "companion"
        ? `${timeWord}顺访 ${place.name}，与主线相邻，步行即可衔接`
        : role === "indoor-fallback"
          ? `${timeWord}若天气变脸，改访 ${place.name} 的室内展陈`
          : `${timeWord}在 ${place.name} 一带散步、觅食或小逛`;

  const parts = [lead, spot.experience];
  if (place.address) parts.push(`📍 ${place.address}`);
  if (spot.tips[0]) parts.push(spot.tips[0]);

  return parts.join("。") + "。";
}

export function describeCrossCityArrival(origin: string, destination: string): string {
  return `从 ${origin} 乘「交通与耗时」中的推荐车次出发，抵达 ${destination} 后先办理入住或寄存行李，再轻装开启城区第一段旅程。首日留白一点，反而走得更远。`;
}

export function describeNeighborhoodExplore(
  destination: string,
  dayIndex: number,
  opts?: { coupleRomantic?: boolean }
): { title: string; description: string } {
  const dest = destination.replace(/市$/u, "");
  const variants = opts?.coupleRomantic
    ? [
        {
          title: `${dest} · 河景黄昏`,
          description:
            "把傍晚交给河风与灯影：并肩慢走，不必说话也很好；找一家靠窗小馆，把最后一缕天光收进相册里。",
        },
        {
          title: `${dest} · 巷弄夜话`,
          description:
            "钻进有生活气的胡同或老街，选一家顺眼的店坐下，听方言、分一碗热食，把节奏交给彼此。",
        },
        {
          title: `${dest} · 二人留白`,
          description:
            "刻意空出 40～60 分钟无安排：咖啡馆、书店或任意一条顺眼的路，意外遇见往往在这时发生。",
        },
      ]
    : [
        {
          title: `${dest} · 老城街巷`,
          description:
            "不赶景点的一天：钻进有生活气的胡同或老街，找一家小馆坐下，看行人、听方言、尝一口本地味道。",
        },
        {
          title: `${dest} · 滨水慢行`,
          description:
            "沿江河、湖泊或绿道散步，带一杯咖啡或茶，把节奏交给水声和偶然遇见的街头音乐。",
        },
        {
          title: `${dest} · 市集与夜生活`,
          description:
            "傍晚起逛人气市集或特色街区，选 1～2 家顺眼的店，把返程前最后一夜留给城市温度。",
        },
      ];
  return variants[dayIndex % variants.length];
}

export function buildThemeTitle(
  kind: "arrival" | "landmarks" | "indoor",
  destination: string
): string {
  const city = destination.replace(/市$/u, "");
  switch (kind) {
    case "arrival":
      return `初识 ${city} · 城市开场白`;
    case "landmarks":
      return "必访地标 · 把经典走成自己的故事";
    case "indoor":
      return "晴雨皆宜 · 室内也能很精彩";
  }
}

export function buildThemeDescription(
  kind: "arrival" | "landmarks" | "indoor",
  places: CuratedAttraction[],
  destination: string
): string {
  if (places.length === 0) return "";
  const names = places.map((p) => p.name).join("、");
  const city = destination.replace(/市$/u, "");
  const spots = places.map((p) => describeAttractionSpotlight(p));

  if (kind === "arrival") {
    return `落地 ${city} 后，从 ${names} 开始认识这座城市——${spots[0].tagline}。片区紧凑、步行可达，最适合作为抵达当日的「开场白」。`;
  }
  if (kind === "landmarks") {
    return `${names} 是这次 ${city} 行的主线风景。${spots[0].tagline}——每天只专心一片，比走马观花更接近旅行该有的样子。`;
  }
  return `若遇雨或高温，${names} 是舒适的 Plan B：${spots[0].tagline}。室内冷气和好展陈，一样能让一天过得很满。`;
}

export function buildThemePlaceHighlights(places: CuratedAttraction[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of places) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    const spot = describeAttractionSpotlight(p);
    const addr = p.address ? ` · ${p.address}` : "";
    out.push(`【${p.name}】${spot.tagline}。${spot.experience}${addr}`);
    if (out.length >= 4) break;
  }
  return out;
}

export function buildWeatherAdviceItems(
  daily: import("./types").TripPlanDailyWeather[]
): string[] {
  const items: string[] = [];
  const rainyDays = daily.filter((d) => /雨|雷|雪/.test(d.summary));
  const hotDays = daily.filter((d) => (d.tempMax ?? 0) >= 30);
  const coolDays = daily.filter((d) => (d.tempMin ?? 99) <= 14);
  const aqiHigh = daily.some((d) => (d.aqi ?? 0) > 100);

  if (rainyDays.length > 0) {
    const dates = rainyDays.map((d) => d.dateIso.slice(5)).join("、");
    items.push(`🌂 ${dates} 可能有雨，折叠伞塞进包侧袋，雨日也能很浪漫`);
  }
  if (hotDays.length > 0) {
    items.push("🧴 白天偏热，防晒帽+水壶是标配，11:00–15:00 尽量找阴凉或室内");
  }
  if (coolDays.length > 0) {
    items.push("🧥 早晚温差大，薄外套或披肩比硬扛冷热更聪明");
  }
  if (aqiHigh) {
    items.push("😷 部分日期空气一般，敏感人群可备口罩，缩短长时间户外");
  } else if (daily.some((d) => (d.aqi ?? 999) <= 50)) {
    items.push("🌿 多数日子空气不错，适合户外暴走与随手拍");
  }
  items.push("👟 一双合脚的鞋，比任何攻略都靠谱");
  return items.slice(0, 5);
}

export function buildWeatherAdviceProse(
  daily: import("./types").TripPlanDailyWeather[]
): string {
  return buildWeatherAdviceItems(daily).join("；") + "。";
}
