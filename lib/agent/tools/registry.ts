import type { IToolRegistry, ToolDefinition, ToolName, UserToolSetting } from "../contracts";

export class ToolRegistry implements IToolRegistry {
  constructor(private readonly tools: Map<ToolName, ToolDefinition>) {}

  static fromDefinitions(definitions: ToolDefinition[]): ToolRegistry {
    return new ToolRegistry(new Map(definitions.map((t) => [t.name, t] as const)));
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: ToolName): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listForUser(_userId: string, settings: UserToolSetting[]): ToolDefinition[] {
    if (!settings.length) return this.list();
    const disabled = new Set(settings.filter((s) => !s.enabled).map((s) => s.toolName));
    return this.list().filter((t) => !disabled.has(t.name));
  }

  /** 按显式工具名子集过滤；undefined 表示不过滤，[] 表示全部禁用 */
  filterByNames(names?: ToolName[]): ToolRegistry {
    if (names === undefined) return this;
    if (names.length === 0) return ToolRegistry.fromDefinitions([]);
    const allowed = new Set(names);
    const filtered = this.list().filter((t) => allowed.has(t.name));
    return ToolRegistry.fromDefinitions(filtered);
  }
}
