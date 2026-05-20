import crypto from "crypto";
import http from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerInventoryTools } from "./tools/inventory";
import { registerNotesTools } from "./tools/notes";
import { registerMaintenanceTools } from "./tools/maintenance";
import { registerDocumentsTools } from "./tools/documents";

const port = Number(process.env.MCP_PORT ?? 5001);
const token = (process.env.MCP_AUTH_TOKEN ?? "").trim();

if (!token) {
  console.error("MCP_AUTH_TOKEN is required");
  process.exit(1);
}

function unauthorized(res: http.ServerResponse) {
  res.writeHead(401, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const mcp = new McpServer({ name: "inventario-mcp", version: "1.0.0" });
registerInventoryTools(mcp);
registerNotesTools(mcp);
registerMaintenanceTools(mcp);
registerDocumentsTools(mcp);

const server = http.createServer(async (req, res) => {
  if (req.url !== "/mcp" || req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return unauthorized(res);
  const givenToken = auth.slice("Bearer ".length).trim();
  if (!tokenMatches(givenToken, token)) return unauthorized(res);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`MCP server listening on :${port}`);
});
