import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ComponentProperty } from "../../domain/types";
import { McpSceneAdapter } from "../../sceneGraph/mcpSceneAdapter";
import {
  applyApprovedComponentChangePlan,
  type UnityComponentApplicationBridge,
  type UnityComponentApplicationTarget,
} from "./application";
import { getApprovedComponentChanges } from "./approval";
import type { ComponentChangePlan } from "./index";

type McpTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
type TextBlock = { type: "text"; text: string };

export interface UnityCliMcpApplicationOptions {
  configPath?: string;
  serverName?: string;
  requestTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isTextBlock(value: unknown): value is TextBlock {
  return (
    isRecord(value) &&
    value.type === "text" &&
    typeof value.text === "string"
  );
}

function requiredRecord(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${location} must be an object.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requiredString(value: unknown, location: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${location} must be a non-empty string.`);
  }
  return value;
}

function parseServerConfig(
  value: unknown,
  serverName: string,
  configPath: string,
): StdioServerParameters {
  const config = requiredRecord(value, "MCP config");
  const servers = requiredRecord(config.mcpServers, "MCP config.mcpServers");
  const server =
    requiredRecord(
    servers[serverName],
    `MCP config.mcpServers.${serverName}`,
    );

  if (server.type !== "stdio") {
    throw new Error(
      `MCP server "${serverName}" must use the stdio transport.`,
    );
  }

  const command = requiredString(
    server.command,
    `MCP config.mcpServers.${serverName}.command`,
  );
  const args = server.args ?? [];
  if (!isStringArray(args)) {
    throw new Error(
      `MCP config.mcpServers.${serverName}.args must be an array of strings.`,
    );
  }

  const env = server.env;
  if (env !== undefined && !isStringRecord(env)) {
    throw new Error(
      `MCP config.mcpServers.${serverName}.env must contain only string values.`,
    );
  }

  return {
    command,
    args,
    cwd: path.dirname(configPath),
    ...(env ? { env } : {}),
    stderr: "inherit",
  };
}

async function readServerParameters(
  options: UnityCliMcpApplicationOptions,
): Promise<StdioServerParameters> {
  const configPath = path.resolve(options.configPath ?? ".mcp.json");
  let fileContents: string;
  try {
    fileContents = await readFile(configPath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read MCP config at ${configPath}: ${errorMessage(error)}`,
    );
  }

  let config: unknown;
  try {
    config = JSON.parse(fileContents);
  } catch (error) {
    throw new Error(
      `MCP config at ${configPath} is not valid JSON: ${errorMessage(error)}`,
    );
  }

  return parseServerConfig(config, options.serverName ?? "unity", configPath);
}

function requiredTool(tools: Map<string, McpTool>, name: string): McpTool {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unity CLI MCP does not expose the required "${name}" tool.`);
  }
  return tool;
}

function toolProperties(tool: McpTool): Record<string, unknown> {
  const properties = tool.inputSchema.properties;
  return properties && isRecord(properties) ? properties : {};
}

function requiredPropertyName(
  tool: McpTool,
  candidates: string[],
  description: string,
): string {
  const properties = toolProperties(tool);
  const propertyName = candidates.find((candidate) =>
    Object.prototype.hasOwnProperty.call(properties, candidate),
  );
  if (!propertyName) {
    throw new Error(
      `Unity CLI MCP tool "${tool.name}" has no supported ${description} argument.`,
    );
  }
  return propertyName;
}

function validateToolArguments(
  tool: McpTool,
  args: Record<string, unknown>,
): void {
  for (const required of tool.inputSchema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(args, required)) {
      throw new Error(
        `Unity CLI MCP tool "${tool.name}" requires unsupported argument "${required}".`,
      );
    }
  }
}

function parseToolOutput(
  result: unknown,
  toolName: string,
): Record<string, unknown> {
  const resultRecord = requiredRecord(result, `Unity CLI MCP ${toolName} result`);
  const content = Array.isArray(resultRecord.content)
    ? resultRecord.content
    : [];
  if (resultRecord.isError === true) {
    const message = content
      .filter(isTextBlock)
      .map((item) => item.text)
      .join("\n");
    throw new Error(`Unity CLI MCP ${toolName} failed: ${message}`);
  }

  if (isRecord(resultRecord.structuredContent)) {
    return resultRecord.structuredContent;
  }
  if (!Array.isArray(resultRecord.content)) {
    throw new Error(`Unity CLI MCP ${toolName} returned no tool content.`);
  }

  const textBlocks = content.filter(isTextBlock);
  if (textBlocks.length !== 1) {
    throw new Error(
      `Unity CLI MCP ${toolName} returned ${textBlocks.length} text blocks; expected one JSON result.`,
    );
  }
  try {
    return requiredRecord(
      JSON.parse(textBlocks[0]!.text),
      `Unity CLI MCP ${toolName} result`,
    );
  } catch (error) {
    throw new Error(
      `Unity CLI MCP ${toolName} did not return a valid JSON object: ${errorMessage(error)}`,
    );
  }
}

function requiredGameObjects(
  result: Record<string, unknown>,
  toolName: string,
): Record<string, unknown>[] {
  if (!Array.isArray(result.gameObjects)) {
    throw new Error(
      `Unity CLI MCP ${toolName} result.gameObjects must be an array.`,
    );
  }
  return result.gameObjects.map((gameObject, index) =>
    requiredRecord(gameObject, `${toolName}.gameObjects[${index}]`),
  );
}

function canonicalHierarchyPath(value: string): string {
  return value.replace(/^\/+/, "");
}

function instanceIdValue(
  tool: McpTool,
  argumentName: string,
  target: Pick<UnityComponentApplicationTarget, "handle" | "globalObjectId">,
): string | number {
  if (argumentName === "globalObjectId" || argumentName === "globalId") {
    return target.globalObjectId;
  }

  const schema = toolProperties(tool)[argumentName];
  const schemaType = isRecord(schema) ? schema.type : undefined;
  if (schemaType === "integer" || schemaType === "number") {
    const instanceId = Number(target.handle);
    if (!Number.isSafeInteger(instanceId)) {
      throw new Error(
        `Unity CLI MCP tool "${tool.name}" requires a numeric instance ID.`,
      );
    }
    return instanceId;
  }
  if (schemaType === "string") {
    return target.handle;
  }
  throw new Error(
    `Unity CLI MCP tool "${tool.name}" target argument "${argumentName}" must be a string or number.`,
  );
}

function createComponentArguments(
  tool: McpTool,
  target: Pick<UnityComponentApplicationTarget, "handle" | "globalObjectId">,
  componentType: string,
  properties?: ComponentProperty,
): Record<string, unknown> {
  const targetArgument = requiredPropertyName(
    tool,
    ["globalObjectId", "globalId", "gameObjectId", "game_object_id", "instanceId", "instance_id"],
    "GlobalObjectId or instance ID",
  );
  const componentArgument = requiredPropertyName(
    tool,
    ["componentType", "component_type"],
    "fully qualified component type",
  );
  const args: Record<string, unknown> = {
    [targetArgument]: instanceIdValue(tool, targetArgument, target),
    [componentArgument]: componentType,
  };

  if (properties !== undefined) {
    const propertiesArgument = requiredPropertyName(
      tool,
      ["properties", "componentProperties", "component_properties"],
      "component properties",
    );
    args[propertiesArgument] = properties;
  }
  validateToolArguments(tool, args);
  return args;
}

class UnityCliMcpApplicationBridge implements UnityComponentApplicationBridge {
  constructor(
    private readonly client: Client,
    private readonly tools: Map<string, McpTool>,
    private readonly requestTimeoutMs: number,
  ) {}

  async inspectTarget(
    globalObjectId: string,
    componentType: string,
  ): Promise<UnityComponentApplicationTarget[]> {
    const hierarchyTool = requiredTool(this.tools, "get_scene_hierarchy");
    const findTool = requiredTool(this.tools, "find_gameobjects");
    const [hierarchyResult, allObjectsResult] = await Promise.all([
      this.call(hierarchyTool, {}),
      this.call(findTool, {}),
    ]);
    const snapshot = McpSceneAdapter.normalize(
      hierarchyResult,
      allObjectsResult,
    ).snapshot;
    const matchedObjects = snapshot.gameObjects.filter(
      (gameObject) => gameObject.globalId === globalObjectId,
    );
    if (matchedObjects.length !== 1) {
      return [];
    }
    const [gameObject] = matchedObjects;
    if (!gameObject) {
      return [];
    }

    const rawMatches = requiredGameObjects(allObjectsResult, findTool.name).filter(
      (gameObjectResult) =>
        gameObjectResult.globalId === globalObjectId &&
        typeof gameObjectResult.instanceId === "number" &&
        Number.isSafeInteger(gameObjectResult.instanceId) &&
        typeof gameObjectResult.hierarchyPath === "string" &&
        canonicalHierarchyPath(gameObjectResult.hierarchyPath) ===
          canonicalHierarchyPath(gameObject.hierarchyPath),
    );
    if (rawMatches.length !== 1) {
      return [];
    }
    const rawTarget = rawMatches[0]!;
    const filterArgument = requiredPropertyName(
      findTool,
      ["componentType", "component_type"],
      "fully qualified component type filter",
    );
    const componentResult = await this.call(findTool, {
      [filterArgument]: componentType,
    });
    const componentPresent = requiredGameObjects(
      componentResult,
      findTool.name,
    ).some((candidate) => candidate.globalId === globalObjectId);

    return [
      {
        handle: String(rawTarget.instanceId),
        globalObjectId,
        hierarchyPath: canonicalHierarchyPath(gameObject.hierarchyPath),
        componentPresent,
      },
    ];
  }

  async addComponent(
    target: Pick<UnityComponentApplicationTarget, "handle" | "globalObjectId">,
    componentType: string,
  ): Promise<void> {
    const tool = requiredTool(this.tools, "add_component");
    await this.call(
      tool,
      createComponentArguments(tool, target, componentType),
    );
  }

  async setComponentProperties(
    target: Pick<UnityComponentApplicationTarget, "handle" | "globalObjectId">,
    componentType: string,
    properties: ComponentProperty,
  ): Promise<void> {
    const tool = requiredTool(this.tools, "set_component_properties");
    await this.call(
      tool,
      createComponentArguments(tool, target, componentType, properties),
    );
  }

  private async call(
    tool: McpTool,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    validateToolArguments(tool, args);
    const result = await this.client.callTool(
      { name: tool.name, arguments: args },
      undefined,
      { timeout: this.requestTimeoutMs },
    );
    return parseToolOutput(result, tool.name);
  }
}

async function listAllTools(
  client: Client,
  requestTimeoutMs: number,
): Promise<Map<string, McpTool>> {
  const tools = new Map<string, McpTool>();
  let cursor: string | undefined;
  do {
    const response = await client.listTools(
      cursor ? { cursor } : undefined,
      { timeout: requestTimeoutMs },
    );
    for (const tool of response.tools) {
      tools.set(tool.name, tool);
    }
    cursor = response.nextCursor;
  } while (cursor);
  return tools;
}

export async function applyApprovedComponentChangePlanViaUnityCliMcp(
  plan: ComponentChangePlan,
  options: UnityCliMcpApplicationOptions = {},
): Promise<Awaited<ReturnType<typeof applyApprovedComponentChangePlan>>> {
  getApprovedComponentChanges(plan);

  const serverParameters = await readServerParameters(options);
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("requestTimeoutMs must be a positive safe integer.");
  }

  const transport = new StdioClientTransport(serverParameters);
  const client = new Client(
    { name: "cck-scenegraph-tools", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport, { timeout: requestTimeoutMs });
    const tools = await listAllTools(client, requestTimeoutMs);
    const bridge = new UnityCliMcpApplicationBridge(
      client,
      tools,
      requestTimeoutMs,
    );
    return await applyApprovedComponentChangePlan(plan, bridge);
  } finally {
    await client.close();
  }
}
