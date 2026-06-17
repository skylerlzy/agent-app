import { FeatureScreenshotMock } from "@/components/home/FeatureScreenshotMocks";
import { LANDING_FEATURE_SECTIONS, type LandingFeatureSection } from "@/lib/landingContent";
import { cn } from "@/lib/utils";

const ACCENT_STYLES: Record<
  LandingFeatureSection["accent"],
  { badge: string; glow: string; border: string }
> = {
  emerald: {
    badge: "border-emerald-500/35 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200",
    glow: "from-emerald-500/20 via-transparent to-transparent",
    border: "border-emerald-500/20",
  },
  teal: {
    badge: "border-teal-500/35 bg-teal-500/12 text-teal-800 dark:text-teal-200",
    glow: "from-teal-500/20 via-transparent to-transparent",
    border: "border-teal-500/20",
  },
  sky: {
    badge: "border-sky-500/35 bg-sky-500/12 text-sky-800 dark:text-sky-200",
    glow: "from-sky-500/20 via-transparent to-transparent",
    border: "border-sky-500/20",
  },
  amber: {
    badge: "border-amber-500/35 bg-amber-500/12 text-amber-900 dark:text-amber-100",
    glow: "from-amber-500/20 via-transparent to-transparent",
    border: "border-amber-500/20",
  },
};

function FeatureSection({
  section,
  index,
}: {
  section: LandingFeatureSection;
  index: number;
}) {
  const styles = ACCENT_STYLES[section.accent];
  const reversed = index % 2 === 1;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/40 p-6 shadow-sm backdrop-blur-sm sm:p-8",
        styles.border
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-radial opacity-80",
          styles.glow
        )}
        aria-hidden
      />
      <div
        className={cn(
          "grid items-center gap-8 lg:grid-cols-2 lg:gap-10",
          reversed && "lg:[&>*:first-child]:order-2"
        )}
      >
        <div className="relative z-[1]">
          <span
            className={cn(
              "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide",
              styles.badge
            )}
          >
            {section.badge}
          </span>
          <h3 className="mt-4 font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            {section.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{section.description}</p>
          <ul className="mt-5 space-y-2">
            {section.bullets.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-foreground/90 before:mt-1.5 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-primary"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <FeatureScreenshotMock featureId={section.id} />
      </div>
    </article>
  );
}

function FeatureShowcaseIntro({ className }: { className?: string }) {
  return (
    <div className={cn("text-center", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">产品能力</p>
      <h2
        id="features-heading"
        className="mt-2 font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-medium text-foreground sm:mt-3"
      >
        登录后即可体验的完整能力
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground line-clamp-2 sm:mt-3">
        从对话规划、推理可视到知识库与 Skill，VoyageMind 为出行场景打造可演示、可落地的 Agent 工作台。
      </p>
    </div>
  );
}

export function FeatureShowcase({
  className,
  hideIntro = false,
}: {
  className?: string;
  hideIntro?: boolean;
}) {
  return (
    <section
      className={cn("space-y-8 sm:space-y-10", className)}
      aria-labelledby={hideIntro ? undefined : "features-heading"}
    >
      {!hideIntro ? <FeatureShowcaseIntro /> : null}
      <div className="space-y-8 sm:space-y-10">
        {LANDING_FEATURE_SECTIONS.map((section, index) => (
          <FeatureSection key={section.id} section={section} index={index} />
        ))}
      </div>
    </section>
  );
}
