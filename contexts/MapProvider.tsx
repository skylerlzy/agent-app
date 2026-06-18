"use client";

import { ReactNode, useEffect, useState } from "react";

type MapConfigResponse =
  | { configured: false; reason?: "missing_key" }
  | { configured: true; key: string; securityJsCode?: string };

function mapUnavailableHint(): string {
  if (typeof window !== "undefined" && /onrender\.com$/i.test(window.location.hostname)) {
    return "部署方请在 Render Dashboard → Environment 中配置 AMAP_JSAPI_KEY（及 AMAP_JSAPI_SECURITY_CODE），并在高德控制台将该 Render 域名加入 JS API 白名单后重新部署。终端用户无需配置。";
  }
  return "部署方请配置 AMAP_JSAPI_KEY（本地写在 .env.local；生产写在托管平台环境变量），并运行/重启服务。终端用户无需配置。";
}

export function MapProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/map-config", { cache: "no-store" })
      .then((res) => res.json() as Promise<MapConfigResponse>)
      .then((config) => {
        if (cancelled) return;
        if (!config.configured || !config.key?.trim()) {
          setLoadError("missing_key");
          return;
        }

        const key = config.key.trim();
        const sec = config.securityJsCode?.trim();
        if (typeof window !== "undefined" && sec) {
          (window as unknown as { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
            securityJsCode: sec,
          };
        }

        return import("@amap/amap-jsapi-loader")
          .then((mod) => {
            const loader = mod.default ?? mod;
            return loader.load({
              key,
              version: "2.0",
              plugins: ["AMap.Driving", "AMap.Walking", "AMap.Geocoder"],
            });
          })
          .then(() => {
            if (!cancelled) setIsLoaded(true);
          });
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("高德地图加载失败:", e);
          setLoadError("amap_load_failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    const detail =
      loadError === "amap_load_failed"
        ? "Key 已配置但高德 JS 加载失败：请检查是否为「Web端(JS API)」类型 Key，并在高德控制台将当前站点域名加入白名单。"
        : mapUnavailableHint();
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/35 bg-amber-500/5 p-4 text-center text-xs text-muted-foreground">
        <p className="font-medium text-amber-900">地图暂不可用</p>
        <p className="mt-1">{detail}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-[12rem] animate-pulse items-center justify-center rounded-xl border border-border/50 bg-muted/30 text-xs text-muted-foreground">
        地图加载中…
      </div>
    );
  }

  return <>{children}</>;
}
