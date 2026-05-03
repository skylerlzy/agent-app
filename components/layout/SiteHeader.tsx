"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Plane } from "lucide-react";

export interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { user, isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();
  const isHomeGuest = pathname === "/" && isLoaded && !isSignedIn;

  if (isHomeGuest) {
    return null;
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-shadow duration-300 ease-soft",
        className
      )}
    >
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 sm:py-2 lg:px-8">
        <Link
          href="/"
          className="group flex min-w-0 max-w-full flex-1 items-center gap-2.5 text-foreground transition-opacity hover:opacity-90 sm:max-w-[min(100%,36rem)] lg:max-w-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary transition-transform duration-300 ease-soft group-hover:scale-[1.02]">
            <Plane className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 text-pretty text-sm font-medium leading-snug tracking-tight text-foreground sm:text-[0.9375rem]">
            VoyageMind——您的私人出行助手
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {!isLoaded ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-muted/60" aria-hidden />
          ) : isSignedIn && user ? (
            <>
              <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground sm:inline">
                {user.primaryEmailAddress?.emailAddress ?? user.username ?? "已登录"}
              </span>
              <Separator orientation="vertical" className="hidden h-6 bg-border/80 sm:block" decorative />
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "ring-1 ring-border transition-transform duration-300 ease-soft hover:scale-[1.04]",
                  },
                }}
              />
            </>
          ) : (
            <>
              <SignInButton mode="modal">
                <Button variant="secondary" size="sm" className="cursor-pointer" type="button">
                  登录
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button variant="outline" size="sm" className="cursor-pointer" type="button">
                  注册
                </Button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
