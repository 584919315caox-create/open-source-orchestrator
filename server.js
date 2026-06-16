import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getConnectors, getExampleWorkflow, runWorkflow } from "./src/orchestrator.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  const content = await readFile(filePath);
  res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  res.end(content);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/connectors") {
      return sendJson(res, 200, { connectors: getConnectors(), exampleWorkflow: getExampleWorkflow() });
    }

    if (req.method === "POST" && req.url === "/api/run") {
      const body = await readJson(req);
      const result = await runWorkflow(body.workflow);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : 500;
    sendJson(res, status, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Open Source Orchestrator running at http://localhost:${port}`);
});
