/**
 * Next.js 16.3 can write/close a React debug-channel WritableStream after it is
 * already CLOSED (HMR + overlapping RSC refreshes). That TypeError surfaces in
 * the browser overlay and freezes clicks (Connect Repo, audit actions, etc.).
 *
 * Guard both write() and close() so late chunks are dropped silently.
 * See: https://github.com/vercel/next.js/issues/97918
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  "node_modules/next/dist/client/dev/hot-reloader/app/hot-reloader-app.js",
  "node_modules/next/dist/esm/client/dev/hot-reloader/app/hot-reloader-app.js",
];

const MARKER = "/* provix:closed-stream-guard */";

const UNPATCHED_WRITE = "writer.ready.then(()=>writer.write(chunk)).catch(console.error);";
const UNPATCHED_CLOSE = "writer.ready.then(()=>writer.close()).catch(console.error);";

const PATCHED_WRITE = `${MARKER}
                    writer.ready.then(()=>{
                        try {
                            if (writer.desiredSize === null) return;
                            return writer.write(chunk);
                        } catch (error) {
                            if (error instanceof TypeError && /CLOSED writable stream/i.test(String(error && error.message))) {
                                return;
                            }
                            throw error;
                        }
                    }).catch(()=>{});`;

const PATCHED_CLOSE = `${MARKER}
                    writer.ready.then(()=>{
                        try {
                            if (writer.desiredSize === null) return;
                            return writer.close();
                        } catch (error) {
                            if (error instanceof TypeError && /CLOSED writable stream/i.test(String(error && error.message))) {
                                return;
                            }
                            throw error;
                        }
                    }).catch(()=>{});`;

let patched = 0;
for (const relative of TARGETS) {
  const filePath = path.join(ROOT, relative);
  if (!existsSync(filePath)) {
    console.warn(`[patch-next-closed-stream] skip missing ${relative}`);
    continue;
  }
  const original = readFileSync(filePath, "utf8");
  if (original.includes(MARKER)) {
    console.log(`[patch-next-closed-stream] already patched ${relative}`);
    continue;
  }
  if (!original.includes(UNPATCHED_WRITE) || !original.includes(UNPATCHED_CLOSE)) {
    console.warn(`[patch-next-closed-stream] unexpected contents in ${relative}; skipped`);
    continue;
  }
  const next = original.replace(UNPATCHED_WRITE, PATCHED_WRITE).replace(UNPATCHED_CLOSE, PATCHED_CLOSE);
  writeFileSync(filePath, next, "utf8");
  patched += 1;
  console.log(`[patch-next-closed-stream] patched ${relative}`);
}

if (patched === 0) {
  console.log("[patch-next-closed-stream] nothing to patch");
}
