import { NextResponse } from "next/server";
import { OpenAICompatibleClient } from "@/lib/agent/llm/OpenAICompatibleClient";
import { LLMPlanGenerator } from "@/lib/agent/plan/LLMPlanGenerator";
import { ReactExecutor } from "@/lib/agent/loops/ReactExecutor";
import { createStubToolRegistry } from "@/lib/agent/tools/factory";
import { ReflexionPolicy } from "@/lib/agent/reflexion/ReflexionPolicy";

export async function GET() {
    try {
        // 1. 初始化你的模块
        const llmClient = new OpenAICompatibleClient();
        const planner = new LLMPlanGenerator(llmClient);
        const registry = createStubToolRegistry();
        const reflexion = new ReflexionPolicy();
        const executor = new ReactExecutor(llmClient, registry, reflexion);

        const testInput = {
            sessionId: "test-session-" + Date.now(),
            goal: { rawText: "我想知道明天上海的天气，并看看我下午三点是否有空。" },
            context: {
                userId: "user-1",
                preferences: {},
                calendarBusyWindows: [{ start: 1715583600000, end: 1715587200000, label: "会议" }]
            }
        };

        console.log("=== [测试] 开始生成计划 ===");
        const plan = await planner.draftPlan(testInput);
        console.log("生成的计划:", JSON.stringify(plan, null, 2));

        console.log("=== [测试] 开始执行第一步 ===");
        const firstStep = plan.phases[0].steps[0];

        // 模拟 Emitter
        const mockEmitter = {
            emit: (event: any) => {
                console.log(`[事件流] ${event.type}:`, event.payload?.thought || event.payload?.toolName || "");
                return event;
            }
        };

        // 执行第一步
        const events = [];
        for await (const event of executor.executeStep({
            ...testInput,
            plan,
            step: firstStep,
            emitter: mockEmitter as any
        })) {
            events.push(event);
        }

        return NextResponse.json({
            status: "success",
            plan,
            eventsCount: events.length
        });

    } catch (error: any) {
        console.error("测试出错:", error);
        return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
    }
}