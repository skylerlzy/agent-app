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
        <main className="mx-auto w-full max-w-6xl animate-fade-in px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <section>
            <AgentWorkspace />
          </section>
        </main>
      </Show>
    </>
  );
}
