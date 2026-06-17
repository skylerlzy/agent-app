"use client";

import { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ConvexClientRoot } from "./ConvexClientRoot";

export function Providers({ children }: { children: ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("缺少 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      telemetry={false}
      appearance={{
        variables: {
          colorPrimary: "hsl(168 32% 36%)",
          colorText: "hsl(196 28% 22%)",
          colorTextSecondary: "hsl(196 14% 40%)",
          colorBackground: "hsl(165 28% 99%)",
          colorInputBackground: "hsl(0 0% 100%)",
          colorInputText: "hsl(196 26% 20%)",
          colorDanger: "hsl(0 65% 48%)",
          borderRadius: "0.875rem",
        },
      }}
    >
      <SiteHeader />
      <ConvexClientRoot>{children}</ConvexClientRoot>
    </ClerkProvider>
  );
}
