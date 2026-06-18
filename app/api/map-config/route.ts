import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 浏览器地图 Key：优先读服务端变量，兼容 NEXT_PUBLIC_* 旧命名 */
function readMapKey(): string {
  return (
    process.env.AMAP_JSAPI_KEY?.trim() ||
    process.env.NEXT_PUBLIC_AMAP_KEY?.trim() ||
    ""
  );
}

function readSecurityCode(): string {
  return (
    process.env.AMAP_JSAPI_SECURITY_CODE?.trim() ||
    process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE?.trim() ||
    ""
  );
}

/** 供 MapProvider 拉取；终端用户无需自行配置 Key */
export function GET() {
  const key = readMapKey();
  if (!key) {
    return NextResponse.json({ configured: false as const });
  }
  return NextResponse.json({
    configured: true as const,
    key,
    securityJsCode: readSecurityCode(),
  });
}
