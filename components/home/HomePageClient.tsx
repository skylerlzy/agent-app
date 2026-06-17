"use client";

import { Show } from "@clerk/nextjs";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { GuestLanding } from "@/components/home/GuestLanding";

export function HomePageClient() {
  return (
    <>
      <Show when="signed-out">
        <GuestLanding />
      </Show>

      <Show when="signed-in">
        <main className="relative mx-auto w-full max-w-[1600px] animate-fade-in px-3 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
          <div
            className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden rounded-3xl"
            aria-hidden
          >
            <div className="absolute -left-16 top-8 h-52 w-52 rounded-full bg-emerald-400/14 blur-3xl" />
            <div className="absolute right-0 top-1/3 h-60 w-60 rounded-full bg-voyage-sky/12 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-voyage-violet/10 blur-3xl" />
            <div className="absolute right-1/4 top-0 h-36 w-36 rounded-full bg-voyage-amber/10 blur-3xl" />
          </div>
          <section>
            <AgentWorkspace />
          </section>
        </main>
      </Show>
    </>
  );
}
