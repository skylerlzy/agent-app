import type { Id } from "./_generated/dataModel";

/** messages 表 conversationId 存 string，与 conversations._id 对齐 */
export function conversationIdKey(id: Id<"conversations"> | string): string {
  return String(id);
}

export function sameConversationId(
  a: Id<"conversations"> | string | undefined | null,
  b: Id<"conversations"> | string | undefined | null
): boolean {
  if (a == null || b == null) return false;
  return conversationIdKey(a) === conversationIdKey(b);
}
