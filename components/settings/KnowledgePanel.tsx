"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Database, FileUp, RefreshCcw, Search, Trash2, Upload } from "lucide-react";

type SourceType = "markdown" | "text" | "pdf";

function parseTags(input: string): string[] {
  return input
    .split(/[,，\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function sourceTypeFromName(name: string): SourceType {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".pdf")) return "pdf";
  return "text";
}

export function KnowledgePanel() {
  const docs = useQuery(api.knowledge.listDocuments, { limit: 100 });
  const uploadDocument = useMutation(api.knowledge.uploadDocument);
  const rebuildDocument = useMutation(api.knowledge.rebuildDocument);
  const removeDocument = useMutation(api.knowledge.removeDocument);

  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("markdown");
  const [text, setText] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results = useQuery(
    api.knowledge.retrieve,
    searchQuery.trim() ? { query: searchQuery.trim(), topK: 5 } : "skip"
  );

  const documents = useMemo(() => docs ?? [], [docs]);

  const handleUpload = useCallback(async () => {
    const body = text.trim();
    if (!body) {
      setError("请粘贴或选择攻略文本。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cleanCity = city.trim();
      const res = await uploadDocument({
        title: title.trim() || "未命名攻略",
        text: body,
        sourceType,
        tags: parseTags(tagsText),
        ...(cleanCity ? { city: cleanCity } : {}),
      });
      setText("");
      setTitle("");
      setCity("");
      setTagsText("");
      setSourceType("markdown");
      setSearchQuery(searchQuery || title.trim());
      if (!res.chunkCount) setError("文档已保存，但未生成可检索分块。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [city, searchQuery, sourceType, tagsText, text, title, uploadDocument]);

  const handleFile = useCallback(async (file: File) => {
    const fileText = await file.text();
    setTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ""));
    setSourceType(sourceTypeFromName(file.name));
    setText(fileText);
  }, []);

  const handleRebuild = useCallback(
    async (documentId: string) => {
      setBusy(true);
      setError(null);
      try {
        await rebuildDocument({ documentId: documentId as Id<"knowledgeDocuments"> });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [rebuildDocument]
  );

  const handleRemove = useCallback(
    async (documentId: string) => {
      if (!window.confirm("确定删除该知识文档及其分块？")) return;
      setBusy(true);
      setError(null);
      try {
        await removeDocument({ documentId: documentId as Id<"knowledgeDocuments"> });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [removeDocument]
  );

  if (docs === undefined) {
    return (
      <GlassCard className="cursor-default border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">加载知识库…</CardContent>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <GlassCard className="cursor-default">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            上传攻略知识
          </CardTitle>
          <CardDescription className="text-xs">
            当前版本使用关键词检索，适合 Markdown、纯文本攻略；PDF 文件会按可读文本入库。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文档标题，如 南京慢游攻略" disabled={busy} />
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="城市，可选，如 南京" disabled={busy} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <select
              value={sourceType}
              disabled={busy}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
            >
              <option value="markdown">Markdown</option>
              <option value="text">纯文本</option>
              <option value="pdf">PDF 文本</option>
            </select>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="标签，用逗号分隔，如 亲子,慢节奏,美食" disabled={busy} />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴攻略、游记或地点说明。上传后会自动分块，Agent 回答时可标注 [来源: 文档 · 段落]。"
            className="min-h-[220px] font-mono text-xs"
            disabled={busy}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" className="gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" />
              选择文件
            </Button>
            <Button type="button" className="gap-1.5" disabled={busy || !text.trim()} onClick={() => void handleUpload()}>
              <Upload className="h-4 w-4" />
              上传并分块
            </Button>
          </div>
        </CardContent>
      </GlassCard>

      {error ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <GlassCard className="cursor-default">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            检索预览
          </CardTitle>
          <CardDescription className="text-xs">
            输入一次用户问题，查看会注入 Agent 的 Top-K 知识块和出处标记。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="例：南京不吃辣有什么美食推荐" />
            <Button type="button" className="shrink-0 gap-1.5" onClick={() => setSearchQuery(searchDraft)}>
              <Search className="h-4 w-4" />
              检索
            </Button>
          </div>
          {searchQuery ? (
            <div className="space-y-2">
              {results === undefined ? (
                <p className="text-xs text-muted-foreground">检索中…</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-muted-foreground">没有匹配的知识块。</p>
              ) : (
                results.map((chunk) => (
                  <div key={chunk.chunkId} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{chunk.documentTitle}</span>
                      <span>[来源: {chunk.documentTitle} · {chunk.citation}]</span>
                      <span>score {chunk.score}</span>
                    </div>
                    <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-foreground">{chunk.content}</p>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </CardContent>
      </GlassCard>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">知识文档</h2>
            <p className="text-xs text-muted-foreground">上传后可重建分块索引，删除会同步清理所有知识块。</p>
          </div>
          <span className="text-xs text-muted-foreground">{documents.length} 个</span>
        </div>

        {documents.length === 0 ? (
          <GlassCard className="cursor-default border-dashed">
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              暂无知识文档。上传城市攻略后，Agent 会按问题检索相关片段。
            </CardContent>
          </GlassCard>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) => (
              <GlassCard key={doc.id} className="cursor-default">
                <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">{doc.title}</h3>
                      <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {doc.chunkCount} 块
                      </span>
                      {doc.city ? (
                        <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          {doc.city}
                        </span>
                      ) : null}
                    </div>
                    {doc.tags.length ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">{doc.tags.join(" · ")}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {doc.sourceType} · {new Date(doc.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => void handleRebuild(doc.id)}>
                      <RefreshCcw className="h-3.5 w-3.5" />
                      重建
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={() => void handleRemove(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </GlassCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
