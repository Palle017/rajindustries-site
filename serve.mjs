/* Local preview of the site root — dev only, never deployed.
 *
 *   node serve.mjs [port]
 *
 * Pages serves docs/ at the domain root, so this does too. */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
const PORT = Number(process.argv[2]) || 8791;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".enc": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, rel === "/" ? "index.html" : rel);

  /* keep traversal above the repo root out */
  if (!file.startsWith(ROOT)) {
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
}).listen(PORT, () => console.log(`site on http://localhost:${PORT}`));
