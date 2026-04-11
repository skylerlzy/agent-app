import type { IToolRegistry, ToolDefinition, ToolName } from "../contracts";

export class ToolRegistry implements IToolRegistry {
  constructor(private readonly tools: Map<ToolName, ToolDefinition>) {}

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: ToolName): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}
