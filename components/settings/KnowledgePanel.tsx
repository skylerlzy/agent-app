"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { KnowledgeChunk } from "@/lib/agent/contracts";
import { EXPECTED_BUILTIN_DOCUMENT_COUNT } from "@/lib/agent/knowledge/builtinKnowledge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Database, FileUp, Search, Trash2, Upload, X } from "lucide-react";

type KnowledgeDocListItem = {
  id: string;
  title: string;
  city?: string;
  tags: string[];
  chunkCount: number;
  embeddingStatus?: "pending" | "ready" | "failed";
  isBuiltin?: boolean;
  sourceUrl?: string;
  tier?: number;
  createdAt?: number;
};

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        aria-label="关闭"
        onClick={onClose}
      />
      <GlassCard
        className={cn(
          "relative z-10 max-h-[85vh] w-full overflow-hidden shadow-xl",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-[calc(85vh-4rem)] overflow-y-auto pt-4">{children}</CardContent>
      </GlassCard>
    </div>
  );
}

function embeddingStatusLabel(status?: KnowledgeDocListItem["embeddingStatus"]) {
  if (status === "ready") return "向量就绪";
  if (status === "pending") return "向量化中";
  if (status === "failed") return "向量失败（仍可用关键词检索）";
  return null;
}

export function KnowledgePanel() {
  const retrieveHybrid = useAction(api.knowledge.retrieveHybrid);
  const uploadText = useMutation(api.knowledge.uploadText);
  const deleteDocument = useMutation(api.knowledge.deleteDocument);
  const bundleStatus = useQuery(api.knowledge.builtinBundleStatus);
  const allDocuments = useQuery(api.knowledge.listDocuments, { limit: 200 });

  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    chunks: KnowledgeChunk[];
    mode: "keyword" | "hybrid";
  } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCity, setUploadCity] = useState("");
  const [uploadBody, setUploadBody] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userDocuments = useMemo(
    () => (allDocuments ?? []).filter((d) => !d.isBuiltin) as KnowledgeDocListItem[],
    [allDocuments]
  );
  const builtinDocuments = useMemo(
    () => (allDocuments ?? []).filter((d) => d.isBuiltin) as KnowledgeDocListItem[],
    [allDocuments]
  );

  const handleSearch = useCallback(async () => {
    const q = searchDraft.trim();
    setSearchQuery(q);
    setSearchResult(null);
    if (!q) return;
    setSearchLoading(true);
    setError(null);
    try {
      const res = await retrieveHybrid({ query: q, topK: 2 });
      setSearchResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchLoading(false);
    }
  }, [retrieveHybrid, searchDraft]);

  const handleUpload = useCallback(async () => {
    const title = uploadTitle.trim();
    const text = uploadBody.trim();
    if (!title || text.length < 20) {
      setError("请填写标题，且正文至少 20 字。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadText({
        title,
        text,
        ...(uploadCity.trim() ? { city: uploadCity.trim() } : {}),
        sourceType: "markdown",
      });
      setUploadOpen(false);
      setUploadTitle("");
      setUploadCity("");
      setUploadBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [uploadBody, uploadCity, uploadText, uploadTitle]);

  const handleFilePick = useCallback(async (file: File) => {
    const text = await file.text();
    setUploadBody(text);
    if (!uploadTitle.trim()) {
      const base = file.name.replace(/\.(md|markdown|txt)$/i, "");
      setUploadTitle(base || "我的出行攻略");
    }
    setUploadOpen(true);
  }, [uploadTitle]);

  const handleDelete = useCallback(
    async (docId: string) => {
      if (!window.confirm("确定删除这份用户文档？删除后无法恢复。")) return;
      setBusy(true);
      setError(null);
      try {
        await deleteDocument({ documentId: docId as Id<"knowledgeDocuments"> });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [deleteDocument]
  );

  const builtinCount = bundleStatus?.documentCount ?? builtinDocuments.length;

  return (
    <div className="space-y-6">
      <GlassCard className="cursor-default">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-primary" />
            RAG 知识库
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            内置 {EXPECTED_BUILTIN_DOCUMENT_COUNT} 份中国城市出行指南已随项目打包在{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">lib/agent/knowledge/data/</code>
            ，关键词检索无需联网。您也可上传自己的 Markdown / 文本攻略，与内置库共同参与 Agent 检索。
            {bundleStatus?.ok ? (
              <span className="mt-1 block text-emerald-600 dark:text-emerald-400">
                {bundleStatus.message}
              </span>
            ) : bundleStatus ? (
              <span className="mt-1 block text-destructive">{bundleStatus.message}</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-4 w-4" />
            上传攻略
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="h-4 w-4" />
            选择 .md / .txt
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFilePick(file);
              e.target.value = "";
            }}
          />
        </CardContent>
      </GlassCard>

      <GlassCard className="cursor-default">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            检索预览
          </CardTitle>
          <CardDescription className="text-xs">
            与 Agent 运行时一致；检索内置库 + 您的上传文档，展示 score 最高的 2 条知识块。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="例：南京晚上适合去哪"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch();
              }}
            />
            <Button type="button" className="shrink-0 gap-1.5" onClick={() => void handleSearch()}>
              <Search className="h-4 w-4" />
              检索
            </Button>
          </div>
          {searchQuery ? (
            <div className="space-y-2">
              {searchLoading ? (
                <p className="text-xs text-muted-foreground">混合检索中…</p>
              ) : !searchResult?.chunks.length ? (
                <p className="text-xs text-muted-foreground">没有匹配的知识块。</p>
              ) : (
                <>
                  {searchResult.mode ? (
                    <p className="text-[11px] text-muted-foreground">
                      模式：
                      {searchResult.mode === "hybrid"
                        ? "混合检索（关键词 + 向量）"
                        : "关键词检索"}
                    </p>
                  ) : null}
                  {searchResult.chunks.map((chunk) => (
                    <div
                      key={chunk.chunkId}
                      className="rounded-lg border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{chunk.documentTitle}</span>
                        <span>
                          [来源: {chunk.documentTitle} · {chunk.citation}]
                        </span>
                        <span>score {chunk.score}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-foreground">
                        {chunk.content}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </GlassCard>

      {error ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">我的文档</h2>
            <p className="text-xs text-muted-foreground">上传后自动分块并向量化，参与 Agent 检索</p>
          </div>
          <span className="text-xs text-muted-foreground">{userDocuments.length} 个</span>
        </div>
        {!userDocuments.length ? (
          <GlassCard className="cursor-default border-dashed">
            <CardContent className="py-6 text-center text-xs text-muted-foreground">
              尚未上传文档。可粘贴 Markdown 或选择 .md / .txt 文件。
            </CardContent>
          </GlassCard>
        ) : (
          <div className="grid gap-2">
            {userDocuments.map((doc) => (
              <GlassCard key={doc.id} className="cursor-default">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">{doc.title}</h3>
                      {doc.city ? (
                        <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          {doc.city}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">{doc.chunkCount} 块</span>
                      {embeddingStatusLabel(doc.embeddingStatus) ? (
                        <span className="text-[11px] text-muted-foreground">
                          {embeddingStatusLabel(doc.embeddingStatus)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                    disabled={busy}
                    onClick={() => void handleDelete(doc.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </CardContent>
              </GlassCard>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">内置文档（只读）</h2>
            <p className="text-xs text-muted-foreground">中国一线 / 二线城市 Wikivoyage 指南，本地 JSON 打包</p>
          </div>
          <span className="text-xs text-muted-foreground">{builtinCount} 个</span>
        </div>
        <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
          {builtinDocuments.map((doc) => (
            <GlassCard key={doc.id} className="cursor-default">
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">{doc.title}</h3>
                  {doc.city ? (
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      {doc.city}
                    </span>
                  ) : null}
                  <span className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    内置
                  </span>
                  {doc.tier === 1 ? (
                    <span className="text-[11px] text-muted-foreground">一线</span>
                  ) : doc.tier === 2 ? (
                    <span className="text-[11px] text-muted-foreground">二线</span>
                  ) : null}
                </div>
                {doc.sourceUrl ? (
                  <a
                    href={doc.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-[11px] text-primary hover:underline"
                  >
                    {doc.sourceUrl}
                  </a>
                ) : null}
              </CardContent>
            </GlassCard>
          ))}
        </div>
      </section>

      {uploadOpen ? (
        <Modal title="上传出行攻略" onClose={() => setUploadOpen(false)} wide>
          <div className="space-y-3">
            <Input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="文档标题，如：南京周末慢游笔记"
            />
            <Input
              value={uploadCity}
              onChange={(e) => setUploadCity(e.target.value)}
              placeholder="关联城市（可选），如：南京"
            />
            <Textarea
              value={uploadBody}
              onChange={(e) => setUploadBody(e.target.value)}
              placeholder="粘贴 Markdown 或纯文本攻略…"
              className="min-h-[240px] font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={busy} onClick={() => void handleUpload()}>
                {busy ? "上传中…" : "保存并分块"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
