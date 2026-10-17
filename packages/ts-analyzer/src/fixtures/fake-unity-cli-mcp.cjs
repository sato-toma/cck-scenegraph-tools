const fs = require("node:fs");
const readline = require("node:readline");

const statePath = process.argv[2];
const scenario = process.argv[3] ?? "";
const targetGlobalId = "item-id";
const targetInstanceId = 42;
const components = scenario.startsWith("present:")
  ? [scenario.slice("present:".length)]
  : [];
const state = { started: true, calls: [], components, properties: {} };
const root = {
  name: "Root",
  instanceId: 1,
  hierarchyPath: "/Root",
  activeSelf: true,
  components: ["Transform"],
  children: [
    {
      name: "Item",
      instanceId: targetInstanceId,
      hierarchyPath: "/Root/Item",
      activeSelf: true,
      components: ["Transform", ...components],
      children: [],
    },
  ],
};

function saveState() {
  fs.writeFileSync(statePath, JSON.stringify(state));
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function toolResult(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}

const tools = [
  {
    name: "get_scene_hierarchy",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "find_gameobjects",
    inputSchema: {
      type: "object",
      properties: { componentType: { type: "string" } },
    },
  },
  {
    name: "add_component",
    inputSchema: {
      type: "object",
      properties: {
        gameObjectId: { type: "integer" },
        componentType: { type: "string" },
      },
      required: ["gameObjectId", "componentType"],
    },
  },
  {
    name: "set_component_properties",
    inputSchema: {
      type: "object",
      properties: {
        gameObjectId: { type: "integer" },
        componentType: { type: "string" },
        properties: { type: "object" },
      },
      required: ["gameObjectId", "componentType", "properties"],
    },
  },
];

saveState();
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "notifications/initialized") {
    return;
  }
  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "fake-unity-mcp", version: "1.0.0" },
    });
    return;
  }
  if (message.method === "tools/list") {
    respond(message.id, { tools });
    return;
  }
  if (message.method !== "tools/call") {
    respond(message.id, {
      error: { code: -32601, message: `Unsupported method ${message.method}` },
    });
    return;
  }

  const { name, arguments: args } = message.params;
  state.calls.push({ name, arguments: args });
  if (name === "get_scene_hierarchy") {
    saveState();
    respond(
      message.id,
      toolResult({
        sceneName: "test",
        scenePath: "Assets/test.unity",
        isActive: true,
        isDirty: false,
        roots: [root],
      }),
    );
    return;
  }
  if (name === "find_gameobjects") {
    const matchingComponents = args.componentType
      ? components.includes(args.componentType)
        ? [args.componentType]
        : []
      : components;
    const gameObjects =
      args.componentType && matchingComponents.length === 0
        ? []
        : [
            {
              globalId: targetGlobalId,
              instanceId: targetInstanceId,
              hierarchyPath: "/Root/Item",
              type: "GameObject",
            },
            {
              globalId: "root-id",
              instanceId: 1,
              hierarchyPath: "/Root",
              type: "GameObject",
            },
          ];
    saveState();
    respond(message.id, toolResult({ count: gameObjects.length, gameObjects }));
    return;
  }
  if (name === "add_component") {
    if (scenario === "fail-add") {
      saveState();
      respond(
        message.id,
        toolResult({ message: "MCP tool rejected the request" }, true),
      );
      return;
    }
    components.push(args.componentType);
    root.children[0].components.push(args.componentType);
    saveState();
    respond(message.id, toolResult({ success: true }));
    return;
  }
  if (name === "set_component_properties") {
    state.properties = args.properties;
    saveState();
    respond(message.id, toolResult({ success: true }));
    return;
  }
  respond(message.id, {
    error: { code: -32602, message: `Unknown tool ${name}` },
  });
});
