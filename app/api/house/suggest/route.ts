import { NextRequest, NextResponse } from "next/server";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

type SuggestBody = {
  ambiance?: string; // 氛围
  iconic?: string; // 标志元素/装饰
  storefront?: string; // 门头与材质
  colorLight?: string; // 色彩与灯光（优先用于配色）
};

function pickPalette(words: string[]) {
  // 非 AI 的“规则建议器”：可用，且可随时替换成真正 LLM/agent
  const has = (re: RegExp) => words.some((w) => re.test(w));
  if (has(/复古|老上海|怀旧|木|黄铜|爵士|vintage/i)) {
    return { primary: "#C97C5D", secondary: "#2D2A32", accent: "#F2E9E4" };
  }
  if (has(/清新|白|日系|极简|minimal|muji/i)) {
    return { primary: "#F8F9FA", secondary: "#2F3E46", accent: "#84A59D" };
  }
  if (has(/霓虹|夜|赛博|酒吧|neon|cyber/i)) {
    return { primary: "#3A0CA3", secondary: "#00F5D4", accent: "#F72585" };
  }
  if (has(/花|植物|绿|庭院|露台|garden/i)) {
    return { primary: "#2A9D8F", secondary: "#264653", accent: "#E9C46A" };
  }
  if (has(/火锅|红|辣|川|湘/i)) {
    return { primary: "#E63946", secondary: "#1D3557", accent: "#F1FAEE" };
  }
  return { primary: "#FF6B6B", secondary: "#1F2937", accent: "#FFD93D" };
}

function pickTemplate(words: string[]) {
  const has = (re: RegExp) => words.some((w) => re.test(w));
  if (has(/玻璃|落地窗|现代|ins|极简|minimal/i)) return "glass";
  if (has(/拱门|法式|欧式|brunch|咖啡/i)) return "arch";
  if (has(/屋顶|小屋|木|庭院|花园/i)) return "gable";
  if (has(/夜|霓虹|酒吧|bar|pub/i)) return "neon";
  return "gable";
}

function pickStickers(words: string[]) {
  const stickers: string[] = [];
  const add = (re: RegExp, s: string) => {
    if (words.some((w) => re.test(w))) stickers.push(s);
  };
  add(/咖啡|cafe|coffee/i, "coffee");
  add(/酒吧|bar|pub|鸡尾酒/i, "bar");
  add(/花|植物|绿|garden/i, "plant");
  add(/火锅|辣|川|湘/i, "spicy");
  add(/面|拉面|粉/i, "noodle");
  add(/海鲜|蟹|生蚝/i, "seafood");
  return stickers.slice(0, 4);
}

function tokenize(s?: string) {
  return (s || "")
    .split(/[,\n，\s/]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export async function POST(req: NextRequest) {
  let body: SuggestBody;
  try {
    body = (await req.json()) as SuggestBody;
  } catch {
    return json({ error: "无效的 JSON" }, 400);
  }
  const wAmb = tokenize(body.ambiance);
  const wIco = tokenize(body.iconic);
  const wSto = tokenize(body.storefront);
  const wClr = tokenize(body.colorLight);

  const wordsAll = [...wAmb, ...wIco, ...wSto, ...wClr].slice(0, 80);
  if (wordsAll.length === 0) {
    return json({ error: "请至少填写一项关键词（氛围/标志元素/门头与材质/色彩与灯光）" }, 400);
  }

  // 规则：模板更受“门头与材质/标志元素”影响；配色优先看“色彩与灯光”
  const template = pickTemplate([...wSto, ...wIco, ...wAmb, ...wClr]);
  const palette = pickPalette(wClr.length ? [...wClr, ...wAmb, ...wIco] : wordsAll);
  const stickers = pickStickers(wordsAll);

  const house = {
    template, // glass/arch/gable/neon
    palette, // primary/secondary/accent
    sign: {
      style: wordsAll.some((w) => /霓虹|neon/i.test(w)) ? "neon" : "wood",
    },
    stickers,
    // 这些参数后续可以扩展（窗户数量、屋顶颜色等）
  };

  return json({ ok: true, house });
}
