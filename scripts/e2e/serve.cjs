// Tiny static server for ./out (trailingSlash export: dir/ -> dir/index.html).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".ico": "image/x-icon", ".json": "application/json" };

function serve(out) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(out, p);
    if (!f.startsWith(out) || !fs.existsSync(f)) {
      res.writeHead(404, { "Content-Type": "text/html" });
      return res.end(fs.readFileSync(path.join(out, "404.html")));
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

function readEnv(root) {
  return Object.fromEntries(
    fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
}

module.exports = { serve, readEnv };
