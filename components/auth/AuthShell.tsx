import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";

export interface AuthShellProps {
  children: ReactNode;
}

/** Clerk 登录/注册页的居中玻璃容器 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-12 sm:px-6">
      <GlassCard className="w-full max-w-md border-border/40 p-2 shadow-xl transition-all duration-300 ease-soft hover:shadow-2xl sm:p-3">
        <div className="animate-fade-in">{children}</div>
      </GlassCard>
    </div>
  );
}
