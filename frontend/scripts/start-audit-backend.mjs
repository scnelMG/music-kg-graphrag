import { createServer } from "node:http";

const port = Number(process.env.AUDIT_BACKEND_PORT ?? "18082");
const sharedSecret = process.env.AUDIT_BACKEND_SHARED_SECRET ?? "audit-local-secret";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError("AUDIT_BACKEND_PORT must be an integer between 1 and 65535.");
}

const server = createServer((request, response) => {
  if (request.headers["x-music-kg-bff-secret"] !== sharedSecret) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "UNAUTHORIZED", requestId: "audit-backend" }));
    return;
  }
  if (request.method === "GET" && request.url === "/api/v1/recommendations/discover") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ albums: [], retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", seedArtist: "" }));
    return;
  }
  if (request.method === "GET" && request.url === "/api/v1/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ mode: "audit", status: "ok" }));
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ code: "ROUTE_NOT_FOUND", requestId: "audit-backend" }));
});

server.listen(port, "127.0.0.1", () => console.log(`Audit backend ready on http://127.0.0.1:${port}`));
