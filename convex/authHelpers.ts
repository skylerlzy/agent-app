import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("未登录：请先通过 Clerk 登录后再操作。");
  }
  return identity.subject;
}
