"use client";

import { SignInButton } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { AgentRunSummary } from "@/components/agent/AgentRunSummary";
import { ReasoningPipeline } from "@/components/agent/ReasoningPipeline";
import { TracePanel } from "@/components/agent/TracePanel";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ACCOMMODATION_OPTIONS,
  DIETARY_PRESET_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PARTY_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  TRAVEL_THEME_OPTIONS,
} from "@/lib/tripPreferenceOptions";
import { CalendarRange, Rocket } from "lucide-react";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00`);
}

function ChipRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
          : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-muted/40",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      {children}
    </button>
  );
}

export function AgentWorkspace() {
  const [userInput, setUserInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");
  const [travelThemes, setTravelThemes] = useState<string[]>([]);
  const [pace, setPace] = useState<"" | "slow" | "balanced" | "fast">("");
  const [accommodationType, setAccommodationType] = useState<"" | "hotel" | "airbnb" | "hostel" | "camping">("");
  const [dietaryPreset, setDietaryPreset] = useState<"" | "none" | "vegetarian" | "halal" | "local">("");
  const [transportPreferences, setTransportPreferences] = useState<string[]>([]);
  const [travelParty, setTravelParty] = useState<"" | "solo" | "couple" | "family" | "group">("");
  const [budgetCny, setBudgetCny] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const events = useQuery(api.agent.listTraceEvents, sessionId ? { sessionId } : "skip");

  const runAgent = useAction(api.agent.runAgent);

  const preferences = useMemo(() => {
    const budgetNum = budgetCny.trim() ? Number(budgetCny.trim()) : undefined;
    const start = tripStart.trim();
    const end = tripEnd.trim();
    return {
      tripStartDateIso: ISO_DAY.test(start) ? start : undefined,
      tripEndDateIso: ISO_DAY.test(end) ? end : undefined,
      travelThemes: travelThemes.length ? travelThemes : undefined,
      pace: pace || undefined,
      accommodationType: accommodationType || undefined,
      dietaryPreset: dietaryPreset === "" ? undefined : dietaryPreset,
      transportPreferences: transportPreferences.length ? transportPreferences : undefined,
      travelParty: travelParty || undefined,
      budgetCny: budgetNum !== undefined && Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      dietaryNotes: dietaryNotes.trim() || undefined,
      additionalNotes: additionalNotes.trim() || undefined,
    };
  }, [
    tripStart,
    tripEnd,
    travelThemes,
    pace,
    accommodationType,
    dietaryPreset,
    transportPreferences,
    travelParty,
    budgetCny,
    dietaryNotes,
    additionalNotes,
  ]);

  const toggleInList = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const run = useCallback(async () => {
    if (!userInput.trim()) {
      setRunError("请输入出行目标。");
      return;
    }
    const ts = tripStart.trim();
    const te = tripEnd.trim();
    if (ts && !ISO_DAY.test(ts)) {
      setRunError("旅行开始日期格式须为 YYYY-MM-DD。");
      return;
    }
    if (te && !ISO_DAY.test(te)) {
      setRunError("旅行结束日期格式须为 YYYY-MM-DD。");
      return;
    }
    if (ts && te && parseLocalNoon(ts) > parseLocalNoon(te)) {
      setRunError("旅行结束日期须不早于开始日期。");
      return;
    }
    setRunError(null);
    const sid = crypto.randomUUID();
    setSessionId(sid);
    setLoading(true);
    const serverTimeoutMs = Number(process.env.NEXT_PUBLIC_AGENT_CLIENT_TIMEOUT_MS) || 180_000;
    try {
      await Promise.race([
        runAgent({
          sessionId: sid,
          goalRaw: userInput.trim(),
          slots: undefined,
          preferences,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `等待 Convex 已超过 ${serverTimeoutMs / 1000} 秒。请检查 DashScope/外网工具超时配置，或在 Convex Dashboard 查看 action 日志。`
              )
            );
          }, serverTimeoutMs);
        }),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(msg);
    } finally {
      setLoading(false);
    }
  }, [runAgent, userInput, preferences]);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="grid gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-stretch lg:gap-8">
        <GlassCard className="cursor-default lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:min-h-[22rem]">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">出行规划</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="space-y-5 rounded-xl border border-border/60 bg-muted/20 px-3 py-4 sm:px-4">
              <p className="text-[11px] font-medium text-muted-foreground">
                与示例项目一致：先选<strong>旅行日期</strong>，再选主题、节奏等；日期会写入规划与天气查询区间（并合并到 goal.slots）。
              </p>

              <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarRange className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  旅行日期
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">开始日期</label>
                    <Input
                      type="date"
                      value={tripStart}
                      onChange={(e) => setTripStart(e.target.value)}
                      disabled={loading}
                      className="cursor-pointer font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">结束日期</label>
                    <Input
                      type="date"
                      value={tripEnd}
                      onChange={(e) => setTripEnd(e.target.value)}
                      disabled={loading}
                      className="cursor-pointer font-medium"
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">可选；填写后 Agent 将按该窗口安排逐日天气与行程跨度。</p>
              </div>

              <ChipRow label="旅行主题" hint="可多选">
                {TRAVEL_THEME_OPTIONS.map((t) => (
                  <Chip
                    key={t.id}
                    active={travelThemes.includes(t.id)}
                    disabled={loading}
                    onClick={() => toggleInList(t.id, travelThemes, setTravelThemes)}
                  >
                    {t.label}
                  </Chip>
                ))}
              </ChipRow>

              <ChipRow label="旅行节奏" hint="影响日程松紧与景点数量建议">
                {TRAVEL_PACE_OPTIONS.map((p) => (
                  <Chip
                    key={p.id}
                    active={pace === p.id}
                    disabled={loading}
                    onClick={() => setPace((prev) => (prev === p.id ? "" : p.id))}
                  >
                    {p.label}
                  </Chip>
                ))}
              </ChipRow>

              <ChipRow label="住宿类型">
                {ACCOMMODATION_OPTIONS.map((a) => (
                  <Chip
                    key={a.id}
                    active={accommodationType === a.id}
                    disabled={loading}
                    onClick={() =>
                      setAccommodationType((prev) => (prev === a.id ? "" : (a.id as typeof accommodationType)))
                    }
                  >
                    {a.label}
                  </Chip>
                ))}
              </ChipRow>

              <ChipRow label="饮食习惯预设">
                {DIETARY_PRESET_OPTIONS.map((d) => (
                  <Chip
                    key={d.id}
                    active={dietaryPreset === d.id}
                    disabled={loading}
                    onClick={() =>
                      setDietaryPreset((prev) => (prev === d.id ? "" : (d.id as typeof dietaryPreset)))
                    }
                  >
                    {d.label}
                  </Chip>
                ))}
              </ChipRow>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">饮食补充说明（可选）</label>
                <Input
                  value={dietaryNotes}
                  onChange={(e) => setDietaryNotes(e.target.value)}
                  placeholder="过敏源、忌口细节等"
                  disabled={loading}
                />
              </div>

              <ChipRow label="交通方式偏好" hint="可多选，用于规划文案与路线 mode 倾向">
                {TRANSPORT_OPTIONS.map((t) => (
                  <Chip
                    key={t.id}
                    active={transportPreferences.includes(t.id)}
                    disabled={loading}
                    onClick={() => toggleInList(t.id, transportPreferences, setTransportPreferences)}
                  >
                    {t.label}
                  </Chip>
                ))}
              </ChipRow>

              <ChipRow label="同行规模">
                {TRAVEL_PARTY_OPTIONS.map((p) => (
                  <Chip
                    key={p.id}
                    active={travelParty === p.id}
                    disabled={loading}
                    onClick={() => setTravelParty((prev) => (prev === p.id ? "" : (p.id as typeof travelParty)))}
                  >
                    {p.label}
                  </Chip>
                ))}
              </ChipRow>

              <div className="space-y-2 sm:max-w-xs">
                <label className="text-xs font-semibold text-foreground">人均预算（元，可选）</label>
                <Input
                  type="number"
                  min={0}
                  value={budgetCny}
                  onChange={(e) => setBudgetCny(e.target.value)}
                  placeholder="如 3000"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">备注与特别要求（可选）</label>
                <Textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="例：带老人小孩、必去某博物馆、尽量避开周一闭馆…"
                  className="min-h-[88px] resize-y text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">出行目标</label>
              <Textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="例：下周末从南京到杭州两天一夜，想了解目的地天气与高铁站到景区的大致路程耗时。"
                className="min-h-[140px] cursor-text"
                disabled={loading}
              />
            </div>

            {runError ? (
              <p className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {runError}
              </p>
            ) : null}

            <Button
              type="button"
              onClick={() => void run()}
              disabled={loading}
              className="h-11 w-full gap-2 text-base shadow-md shadow-primary/15 sm:w-auto sm:px-10"
            >
              {loading ? (
                "编排运行中…"
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  运行自治 Agent
                </>
              )}
            </Button>
          </CardContent>
        </GlassCard>

        <ReasoningPipeline
          className="lg:col-start-2 lg:row-start-1"
          events={events ?? []}
          isRunning={loading}
        />

        <GlassCard className="cursor-default lg:col-start-2 lg:row-start-2 lg:flex lg:min-h-0 lg:flex-col">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="text-lg">推理时间轴</CardTitle>
            <CardDescription>默认仅显示当前焦点；可展开查看完整事件流。</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden pt-0">
            <TracePanel events={events ?? []} isAwaitingRun={loading} variant="peek" />
          </CardContent>
        </GlassCard>
      </div>

      <AgentRunSummary events={events ?? []} />
    </div>
  );
}

export function AgentWorkspaceGate() {
  return (
    <GlassCard className="border-dashed border-primary/25">
      <CardHeader>
        <CardTitle className="text-base">登录解锁完整能力</CardTitle>
        <CardDescription>
          Clerk 身份通过后，可调用云端 Agent 并查看完整事件轨迹。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInButton mode="modal">
          <Button variant="default" className="cursor-pointer gap-2" type="button">
            <Rocket className="h-4 w-4" />
            登录以继续
          </Button>
        </SignInButton>
      </CardContent>
    </GlassCard>
  );
}
