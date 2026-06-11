"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BookOpen, Brain, Database, Sparkles, Wrench } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { href: "/settings/skills", label: "Skill 管理", icon: Sparkles },
  { href: "/settings/tools", label: "工具管理", icon: Wrench },
  { href: "/settings/memory", label: "长期记忆", icon: Brain },
  { href: "/settings/knowledge", label: "知识库", icon: Database },
] as const;

export interface SettingsLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsLayout({ title, description, children }: SettingsLayoutProps) {
  const pathname = usePathname();

  return (
    <main className="mx-auto w-full max-w-5xl animate-fade-in px-3 py-6 sm:px-5 sm:py-8 lg:px-6">
      <SettingsPageHeader title={title} description={description} />

      <div className="grid gap-4 lg:grid-cols-[12rem_1fr] lg:gap-6">
        <nav className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                    : "border-border/70 bg-card/60 text-muted-foreground hover:border-primary/25 hover:bg-muted/30"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}

function SettingsPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <Link href="/" className="shrink-0 text-xs font-medium text-primary hover:underline">
        ← 返回对话
      </Link>
    </div>
  );
}
