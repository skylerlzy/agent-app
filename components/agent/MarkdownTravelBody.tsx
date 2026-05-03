"use client";

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

export interface MarkdownTravelBodyProps {
  markdown: string;
  className?: string;
}

/**
 * 出行方案正文：渲染 LLM 输出的 Markdown（加粗、列表、段落等），统一排版与字号。
 */
export function MarkdownTravelBody({ markdown, className }: MarkdownTravelBodyProps) {
  return (
    <div
      className={cn(
        "markdown-travel text-[15px] leading-[1.75] tracking-[-0.01em] text-foreground/90",
        "[&_p]:mb-3 [&_p:last-child]:mb-0",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:italic [&_em]:text-foreground/85",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-primary/60",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-1 [&_li]:pl-0.5",
        "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-foreground first:[&_h3]:mt-0",
        "[&_hr]:my-4 [&_hr]:border-border/60",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/35 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
        className
      )}
    >
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}
