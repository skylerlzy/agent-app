import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 基于 shadcn Card 的玻璃拟态二次封装 */
export type GlassCardProps = React.ComponentProps<typeof Card>;

export function GlassCard({ className, ...props }: GlassCardProps) {
  return (
    <Card
      className={cn(
        "border-border/70 bg-card/85 shadow-md shadow-primary/[0.06] backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/10",
        className
      )}
      {...props}
    />
  );
}
