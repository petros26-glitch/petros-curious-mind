"use strict";

// Retired endpoint: story image previews have been removed.
// Keep a small health endpoint so the existing Render service can remain healthy
// without serving or generating social image previews.

const http = require("node:http");
const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "no-store");

  if ((req.url || "").split("?")[0] === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok", service: "retired-preview-endpoints" }));
    return;
  }

  res.writeHead(410, { "content-type": "text/plain; charset=utf-8" });
  res.end("Story image previews have been removed. Please use the direct story link.");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Retired preview service health endpoint listening on port " + PORT);
});
