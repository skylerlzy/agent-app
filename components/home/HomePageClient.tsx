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
        <main className="mx-auto w-full max-w-[1600px] animate-fade-in px-3 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
          <section>
            <AgentWorkspace />
          </section>
        </main>
      </Show>
    </>
  );
}
