"use client";

import { ReactNode, useEffect, useState } from "react";

type MapConfigResponse =
  | { configured: false }
  | { configured: true; key: string; securityJsCode?: string };

export function MapProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/map-config", { cache: "no-store" })
      .then((res) => res.json() as Promise<MapConfigResponse>)
      .then((config) => {
        if (cancelled) return;
        if (!config.configured || !config.key?.trim()) {
          setLoadError(true);
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
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-xl border border-dashed border-amber-500/35 bg-amber-500/5 p-4 text-center text-xs text-muted-foreground">
        <p className="font-medium text-amber-900">地图暂不可用</p>
        <p className="mt-1">
          部署方请在 `.env.local` 配置 `AMAP_JSAPI_KEY`（及可选 `AMAP_JSAPI_SECURITY_CODE`），运行 `npm run dev` 即可；终端用户无需配置。
        </p>
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
