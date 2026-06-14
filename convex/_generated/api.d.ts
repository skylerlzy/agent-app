/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as authHelpers from "../authHelpers.js";
import type * as conversationIds from "../conversationIds.js";
import type * as conversations from "../conversations.js";
import type * as knowledge from "../knowledge.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as runValidators from "../runValidators.js";
import type * as skills from "../skills.js";
import type * as toolSettings from "../toolSettings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  authHelpers: typeof authHelpers;
  conversationIds: typeof conversationIds;
  conversations: typeof conversations;
  knowledge: typeof knowledge;
  memories: typeof memories;
  messages: typeof messages;
  runValidators: typeof runValidators;
  skills: typeof skills;
  toolSettings: typeof toolSettings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
