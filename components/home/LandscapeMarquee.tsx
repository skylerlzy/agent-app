"use client";

import Image from "next/image";
import { LANDING_PHOTOS } from "@/lib/landingPhotos";
import { cn } from "@/lib/utils";

const LOOP = [...LANDING_PHOTOS, ...LANDING_PHOTOS];

export function LandscapeMarquee({ className }: { className?: string }) {
  return (
    <section
      className={cn("relative w-full overflow-hidden", className)}
      aria-label="旅行景观轮播"
    >
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-background via-transparent to-background" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-background/20 via-transparent to-background/40" />

      <div className="flex w-max motion-safe:animate-marquee-left motion-reduce:animate-none">
        {LOOP.map((photo, i) => (
          <div
            key={`${photo.src}-${i}`}
            className="relative mx-2.5 h-56 w-80 shrink-0 overflow-hidden rounded-2xl border border-border/50 shadow-lg shadow-primary/10 sm:mx-3 sm:h-64 sm:w-96 md:h-72 md:w-[28rem]"
          >
            <Image
              src={photo}
              alt=""
              fill
              sizes="(max-width: 640px) 320px, (max-width: 768px) 384px, 448px"
              className="object-cover transition-transform duration-700 hover:scale-105"
              priority={i < 2}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
