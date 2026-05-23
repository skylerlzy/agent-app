"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AgentSkill } from "@/lib/agent/contracts";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  isBuiltinSkillEnabled,
  loadBuiltinSkillEnabled,
  setBuiltinSkillEnabled,
} from "@/lib/skillPreferences";
import {
  Eye,
  FileUp,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

function skillDisplayName(skill: AgentSkill): string {
  return skill.name.replace(/-/g, " ");
}

function SkillTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function ToggleButton({
  enabled,
  disabled,
  onClick,
}: {
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        enabled ? "border-primary/50 bg-primary/80" : "border-border bg-muted/60",
        disabled && "pointer-events-none opacity-50"
      )}
      aria-pressed={enabled}
      aria-label={enabled ? "已启用" : "已禁用"}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          enabled ? "left-[1.35rem]" : "left-0.5"
        )}
      />
    </button>
  );
}

function SkillCard({
  skill,
  enabled,
  onToggle,
  onPreview,
  onEdit,
  onDelete,
  busy,
}: {
  skill: AgentSkill;
  enabled: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  busy?: boolean;
}) {
  return (
    <GlassCard className="cursor-default">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{skillDisplayName(skill)}</CardTitle>
            {skill.isBuiltin ? (
              <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                内置
              </span>
            ) : null}
          </div>
          <CardDescription className="mt-1 line-clamp-2 text-xs">{skill.description}</CardDescription>
          <SkillTags tags={skill.tags} />
        </div>
        <ToggleButton enabled={enabled} disabled={busy} onClick={onToggle} />
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onPreview}>
          <Eye className="h-3.5 w-3.5" />
          预览
        </Button>
        {onEdit ? (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        ) : null}
      </CardContent>
    </GlassCard>
  );
}

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

export function SkillsPanel() {
  const skills = useQuery(api.skills.list);
  const uploadMarkdown = useMutation(api.skills.uploadMarkdown);
  const updateSkill = useMutation(api.skills.update);
  const removeSkill = useMutation(api.skills.remove);

  const fileRef = useRef<HTMLInputElement>(null);
  const [builtinEnabled, setBuiltinEnabledState] = useState(loadBuiltinSkillEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [previewSkill, setPreviewSkill] = useState<AgentSkill | null>(null);
  const [editSkill, setEditSkill] = useState<AgentSkill | null>(null);
  const [editMarkdown, setEditMarkdown] = useState("");

  const { builtins, userSkills } = useMemo(() => {
    const list = skills ?? [];
    return {
      builtins: list.filter((s) => s.isBuiltin),
      userSkills: list.filter((s) => !s.isBuiltin),
    };
  }, [skills]);

  const isEnabled = useCallback(
    (skill: AgentSkill) => {
      if (skill.isBuiltin) return isBuiltinSkillEnabled(skill.id, builtinEnabled);
      return skill.enabled;
    },
    [builtinEnabled]
  );

  const handleToggle = useCallback(
    async (skill: AgentSkill) => {
      setError(null);
      if (skill.isBuiltin) {
        const next = setBuiltinSkillEnabled(skill.id, !isEnabled(skill));
        setBuiltinEnabledState(next);
        return;
      }
      setBusy(true);
      try {
        await updateSkill({
          skillId: skill.id as Id<"userSkills">,
          enabled: !skill.enabled,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [isEnabled, updateSkill]
  );

  const handleUpload = useCallback(async () => {
    const text = uploadText.trim();
    if (!text) {
      setError("请粘贴或上传 SKILL.md 内容。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadMarkdown({ markdown: text });
      setUploadOpen(false);
      setUploadText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [uploadMarkdown, uploadText]);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    setUploadText(text);
    setUploadOpen(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editSkill || editSkill.isBuiltin) return;
    setBusy(true);
    setError(null);
    try {
      await updateSkill({
        skillId: editSkill.id as Id<"userSkills">,
        markdownBody: editMarkdown,
      });
      setEditSkill(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [editMarkdown, editSkill, updateSkill]);

  const handleDelete = useCallback(
    async (skill: AgentSkill) => {
      if (skill.isBuiltin) return;
      if (!window.confirm(`确定删除 Skill「${skill.name}」？`)) return;
      setBusy(true);
      setError(null);
      try {
        await removeSkill({ skillId: skill.id as Id<"userSkills"> });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [removeSkill]
  );

  if (skills === undefined) {
    return (
      <GlassCard className="cursor-default border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">加载 Skill…</CardContent>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <GlassCard className="cursor-default">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            上传自定义 Skill
          </CardTitle>
          <CardDescription className="text-xs">
            支持 Anthropic 格式 SKILL.md（含 YAML frontmatter）。上传后可在对话页勾选附加到 Agent。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            className="gap-1.5"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="h-4 w-4" />
            选择 .md 文件
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={busy}
            onClick={() => {
              setUploadText("");
              setUploadOpen(true);
            }}
          >
            <Upload className="h-4 w-4" />
            粘贴 Markdown
          </Button>
        </CardContent>
      </GlassCard>

      {error ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">内置出行 Skill</h2>
        <p className="text-xs text-muted-foreground">团队预置，不可删除；禁用后不会在对话页 Skill 选择器中出现。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {builtins.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              enabled={isEnabled(skill)}
              busy={busy}
              onToggle={() => void handleToggle(skill)}
              onPreview={() => setPreviewSkill(skill)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">我的 Skill</h2>
        {userSkills.length === 0 ? (
          <GlassCard className="cursor-default border-dashed">
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              尚未上传自定义 Skill。点击上方按钮上传 SKILL.md。
            </CardContent>
          </GlassCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {userSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                enabled={isEnabled(skill)}
                busy={busy}
                onToggle={() => void handleToggle(skill)}
                onPreview={() => setPreviewSkill(skill)}
                onEdit={() => {
                  setEditSkill(skill);
                  setEditMarkdown(skill.markdownBody);
                }}
                onDelete={() => void handleDelete(skill)}
              />
            ))}
          </div>
        )}
      </section>

      {uploadOpen ? (
        <Modal title="上传 SKILL.md" onClose={() => setUploadOpen(false)} wide>
          <div className="space-y-3">
            <Textarea
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              placeholder={`---\nname: my-travel-skill\ndescription: ...\ntags: ["标签"]\n---\n\n# 正文`}
              className="min-h-[240px] font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={busy} onClick={() => void handleUpload()}>
                {busy ? "保存中…" : "保存 Skill"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {previewSkill ? (
        <Modal title={`预览 · ${skillDisplayName(previewSkill)}`} onClose={() => setPreviewSkill(null)} wide>
          <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground">
            <ReactMarkdown>{previewSkill.markdownBody}</ReactMarkdown>
          </article>
        </Modal>
      ) : null}

      {editSkill ? (
        <Modal title={`编辑 · ${skillDisplayName(editSkill)}`} onClose={() => setEditSkill(null)} wide>
          <div className="space-y-3">
            <Textarea
              value={editMarkdown}
              onChange={(e) => setEditMarkdown(e.target.value)}
              className="min-h-[280px] font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditSkill(null)}>
                取消
              </Button>
              <Button type="button" disabled={busy} onClick={() => void handleSaveEdit()}>
                {busy ? "保存中…" : "保存修改"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
