"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV_ACCENTS } from "@/lib/voyageTheme";
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
    <main className="relative mx-auto w-full max-w-5xl animate-fade-in px-3 py-6 sm:px-5 sm:py-8 lg:px-6">
      <div
        className="pointer-events-none absolute -left-8 top-0 h-40 w-40 rounded-full bg-voyage-amber/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-6 top-24 h-48 w-48 rounded-full bg-voyage-violet/8 blur-3xl"
        aria-hidden
      />

      <SettingsPageHeader title={title} description={description} />

      <div className="grid gap-4 lg:grid-cols-[12rem_1fr] lg:gap-6">
        <nav className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const accent = SETTINGS_NAV_ACCENTS[href];
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active
                    ? accent.active
                    : cn(
                        "border-border/70 bg-card/60 text-muted-foreground",
                        accent.idle,
                        "hover:text-foreground"
                      )
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? accent.icon : "opacity-70")} strokeWidth={1.75} />
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
    <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/18 via-voyage-teal/12 to-voyage-sky/12 text-primary shadow-sm">
          <BookOpen className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="bg-voyage-brand bg-clip-text text-xl font-semibold tracking-tight text-transparent sm:text-2xl">
            {title}
          </h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <Link
        href="/"
        className="shrink-0 rounded-lg border border-primary/25 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/12"
      >
        ← 返回对话
      </Link>
    </div>
  );
}
