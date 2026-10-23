/* Local preview of the site root — dev only, never deployed.
 *
 *   node serve.mjs [port]
 *
 * Pages serves docs/ at the domain root, so this does too. */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8791;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".enc": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
};

createServer(async (req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split("?")[0]); }
  catch { res.writeHead(400).end("bad request"); return; }
  const file = path.resolve(ROOT, "." + (rel === "/" ? "/index.html" : rel));
  const relative = path.relative(ROOT, file);

  /* keep traversal above the repo root out */
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith("."))) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      /* WebCrypto needs a secure context; localhost counts, but say so plainly */
      "cache-control": "no-store",
    });
    res.end(body);
    console.log(`200 ${rel}`);
  } catch {
    res.writeHead(404).end("not found");
    console.log(`404 ${rel}`);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`site on http://127.0.0.1:${PORT}`));
