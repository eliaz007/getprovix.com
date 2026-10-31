export type MissingErrorHandlingViolation = {
  filePath: string;
  severity: "HIGH";
  rule: "Missing Error Handling";
  line: number;
  message: string;
};

type AsyncBody = {
  name: string;
  open: number;
  close: number;
};

type UnprotectedCall = {
  index: number;
  line: number;
};

const RULE = "Missing Error Handling";

export function serverSurface(filePath: string, content: string): "route" | "action" | null {
  const normalized = filePath.replace(/\\/g, "/");
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)) return null;
  const client = /^\s*['"]use client['"]/.test(content);
  const server = /['"]use server['"]/.test(content);
  if (/(?:^|\/)app\/(?:.+\/)?route\.[cm]?[jt]sx?$/.test(normalized)) return "route";
  if (/(?:^|\/)pages\/api\/.+\.[cm]?[jt]sx?$/.test(normalized)) return "route";
  if (client && !server) return null;
  if (server || /(?:^|\/)actions(?:\/|\.[cm]?[jt]sx?$)/.test(normalized)) return "action";
  return null;
}

export function missingErrorHandlingViolations(filePath: string, content: string): MissingErrorHandlingViolation[] {
  const surface = serverSurface(filePath, content);
  if (!surface) return [];
  return unprotectedCalls(content).map((call) => ({
    filePath: filePath.replace(/\\/g, "/"),
    severity: "HIGH" as const,
    rule: RULE,
    line: call.line,
    message:
      surface === "route"
        ? "API route awaits a database or fetch call outside try/catch, so a failure becomes an unhandled rejection."
        : "Server action awaits a database or fetch call outside try/catch, so a failure becomes an unhandled rejection.",
  }));
}

export function applyErrorHandling(filePath: string, content: string): string | null {
  const surface = serverSurface(filePath, content);
  if (!surface) return null;
  const calls = unprotectedCalls(content);
  if (calls.length === 0) return null;
  const bodies = outermostAsyncBodies(content, calls);
  if (bodies.length === 0) return null;

  let next = content;
  for (const body of [...bodies].sort((left, right) => right.open - left.open)) {
    if (surface === "route") {
      const widened = widenRouteReturn(next, body.open);
      const delta = widened.length - next.length;
      body.open += delta;
      body.close += delta;
      next = widened;
    }
    next = wrapBody(next, body, surface);
  }
  if (surface === "route") next = ensureNextResponseImport(next);
  return next === content ? null : next;
}

function unprotectedCalls(content: string): UnprotectedCall[] {
  const calls: UnprotectedCall[] = [];
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  let escape = false;
  let brace = 0;
  let line = 1;
  let pendingTry = false;
  const tryStack: number[] = [];
  const interp: number[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (char === "\n") {
      line += 1;
      if (mode === "line") mode = "code";
      continue;
    }
    if (mode === "line") continue;
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode === "sq" || mode === "dq" || mode === "tpl") {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if ((mode === "sq" && char === "'") || (mode === "dq" && char === '"') || (mode === "tpl" && char === "`")) {
        mode = "code";
        continue;
      }
      if (mode === "tpl" && char === "$" && next === "{") {
        mode = "code";
        interp.push(brace);
        brace += 1;
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'") mode = "sq";
    else if (char === '"') mode = "dq";
    else if (char === "`") mode = "tpl";
    else if (isWordChar(char)) {
      const word = readWord(content, index);
      if (word === "try") pendingTry = true;
      else if (word === "await" && tryStack.length === 0 && isRiskyAwait(content, index)) {
        calls.push({ index, line });
      } else if (pendingTry) pendingTry = false;
      index += word.length - 1;
    } else if (char === "{") {
      brace += 1;
      if (pendingTry) {
        tryStack.push(brace);
        pendingTry = false;
      }
    } else if (char === "}") {
      if (tryStack[tryStack.length - 1] === brace) tryStack.pop();
      brace = Math.max(0, brace - 1);
      if (interp.length > 0 && brace === interp[interp.length - 1]) {
        interp.pop();
        mode = "tpl";
      }
    }
  }

  return calls;
}

function isRiskyAwait(content: string, awaitIndex: number): boolean {
  const slice = content.slice(awaitIndex, awaitIndex + 700);
  const statement = slice.split(";")[0] ?? slice;
  return (
    /\bfetch\s*\(/.test(statement) ||
    /\.(?:from|rpc|select|insert|update|delete|upsert|query|execute)\s*\(/.test(statement) ||
    /\b(?:prisma|supabase)\s*\./.test(statement) ||
    /\bsql\s*[`(]/.test(statement)
  );
}

function outermostAsyncBodies(content: string, calls: UnprotectedCall[]): AsyncBody[] {
  const containing = asyncFunctionBodies(content).filter((body) =>
    calls.some((call) => call.index > body.open && call.index < body.close)
  );
  return containing.filter(
    (body) => !containing.some((other) => other.open < body.open && other.close > body.close)
  );
}

function asyncFunctionBodies(content: string): AsyncBody[] {
  const bodies: AsyncBody[] = [];
  const pattern =
    /\basync\s+function\s*([A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(|\basync\s*\(|\basync\s+([A-Za-z0-9_]+)\s*=>/g;
  for (const match of content.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (!isCodeIndex(content, start)) continue;
    const name = match[1] || match[2] || "handler";
    const open = match[0].includes("=>")
      ? content.indexOf("{", start + match[0].length - 1)
      : findBodyOpen(content, content.indexOf("(", start));
    if (open == null || open < start) continue;
    const close = matchBrace(content, open);
    if (close == null) continue;
    bodies.push({ name, open, close });
  }
  return bodies;
}

function isCodeIndex(content: string, target: number): boolean {
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  let escape = false;
  for (let index = 0; index < target; index += 1) {
    const char = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (mode === "line") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode === "sq" || mode === "dq" || mode === "tpl") {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if ((mode === "sq" && char === "'") || (mode === "dq" && char === '"') || (mode === "tpl" && char === "`")) mode = "code";
      continue;
    }
    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
    } else if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
    } else if (char === "'") mode = "sq";
    else if (char === '"') mode = "dq";
    else if (char === "`") mode = "tpl";
  }
  return mode === "code";
}

function findBodyOpen(content: string, parenOpen: number): number | null {
  if (parenOpen < 0) return null;
  const parenClose = matchDelim(content, parenOpen, "(", ")");
  if (parenClose == null) return null;
  let depth = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  let escape = false;
  for (let index = parenClose + 1; index < content.length; index += 1) {
    const char = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (mode !== "code") {
      if (mode === "line") {
        if (char === "\n") mode = "code";
      } else if (mode === "block") {
        if (char === "*" && next === "/") {
          mode = "code";
          index += 1;
        }
      } else if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if ((mode === "sq" && char === "'") || (mode === "dq" && char === '"') || (mode === "tpl" && char === "`")) mode = "code";
      continue;
    }
    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      mode = char === "'" ? "sq" : char === '"' ? "dq" : "tpl";
      continue;
    }
    if (depth === 0 && char === "=" && next === ">") {
      index += 1;
      continue;
    }
    if (depth === 0 && char === "{") {
      const close = matchBrace(content, index);
      const after = close == null ? "" : content.slice(close + 1).trimStart();
      if (after.startsWith("{") || after.startsWith("=>")) {
        if (close == null) return null;
        index = close;
        continue;
      }
      return index;
    }
    if (depth === 0 && (char === ";" || char === "=")) return null;
    if (char === "{" || char === "(" || char === "<") depth += 1;
    else if (char === "}" || char === ")" || char === ">") depth = Math.max(0, depth - 1);
  }
  return null;
}

function matchDelim(content: string, open: number, start: string, end: string): number | null {
  let depth = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  let escape = false;
  for (let index = open; index < content.length; index += 1) {
    const char = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (mode === "line") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode === "sq" || mode === "dq" || mode === "tpl") {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if ((mode === "sq" && char === "'") || (mode === "dq" && char === '"') || (mode === "tpl" && char === "`")) mode = "code";
      continue;
    }
    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'") mode = "sq";
    else if (char === '"') mode = "dq";
    else if (char === "`") mode = "tpl";
    else if (char === start) depth += 1;
    else if (char === end) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function matchBrace(content: string, open: number): number | null {
  let depth = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  let escape = false;
  for (let index = open; index < content.length; index += 1) {
    const char = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (mode === "line") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode === "sq" || mode === "dq" || mode === "tpl") {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if ((mode === "sq" && char === "'") || (mode === "dq" && char === '"') || (mode === "tpl" && char === "`")) mode = "code";
      continue;
    }
    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'") mode = "sq";
    else if (char === '"') mode = "dq";
    else if (char === "`") mode = "tpl";
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function wrapBody(content: string, body: AsyncBody, surface: "route" | "action"): string {
  const indent = lineIndent(content, body.open);
  const inner = indentBlock(content.slice(body.open + 1, body.close), "  ");
  const cast = surface === "route" ? " as unknown as NextResponse<any>" : "";
  const catchBody =
    surface === "route"
      ? `${indent}    console.error(error);\n${indent}    return NextResponse.json(\n${indent}      { ok: false, message: "The request could not be completed." },\n${indent}      { status: 500 }\n${indent}    )${cast};`
      : `${indent}    console.error(error);\n${indent}    return { ok: false, message: "The request could not be completed." };`;
  const wrapped = `\n${indent}  try {${inner.endsWith("\n") ? inner : `${inner}\n`}${indent}  } catch (error) {\n${catchBody}\n${indent}  }`;
  const closeIndent = lineIndent(content, body.close);
  return `${content.slice(0, body.open + 1)}${wrapped}\n${closeIndent}${content.slice(body.close)}`;
}

function widenRouteReturn(content: string, bodyOpen: number): string {
  const headStart = Math.max(0, bodyOpen - 800);
  const paren = content.slice(headStart, bodyOpen).lastIndexOf(")");
  if (paren < 0) return content;
  const zoneStart = headStart + paren + 1;
  const zone = content.slice(zoneStart, bodyOpen);
  const arrowStart = zone.search(/=>\s*$/);
  const signature = arrowStart >= 0 ? zone.slice(0, arrowStart) : zone;
  const colon = signature.match(/^(\s*:\s*)([\s\S]+?)(\s*)$/);
  const annotation = colon?.[2]?.replace(/\s+/g, " ").trim();
  if (!colon?.[1] || !annotation || /\b(?:NextResponse|Response)\b/.test(annotation)) return content;
  const promised = annotation.match(/^Promise\s*<([\s\S]*)>\s*$/);
  const widened = promised?.[1]
    ? `Promise<${promised[1].trim()} | NextResponse<any>>`
    : `${annotation} | NextResponse<any>`;
  const rewritten = `${colon[1]}${widened}${colon[3] ?? ""}`;
  const nextZone = arrowStart >= 0 ? `${rewritten}${zone.slice(arrowStart)}` : rewritten;
  return content.slice(0, zoneStart) + nextZone + content.slice(bodyOpen);
}

function ensureNextResponseImport(content: string): string {
  if (/import\s*\{[^}]*\bNextResponse\b[^}]*\}\s*from\s*['"]next\/server['"]/.test(content)) return content;
  const named = content.match(/import\s*\{([^}]*)\}\s*from\s*(['"]next\/server['"])/);
  if (named?.[1] && named[2] && named.index != null) {
    const replaced = `import { NextResponse, ${named[1].trim()} } from ${named[2]}`;
    return content.slice(0, named.index) + replaced + content.slice(named.index + named[0].length);
  }
  const directive = content.match(/^\s*['"]use (?:server|client)['"];?\s*\r?\n/);
  const at = directive?.[0].length ?? 0;
  return `${content.slice(0, at)}import { NextResponse } from "next/server";\n${content.slice(at)}`;
}

function lineIndent(content: string, index: number): string {
  const start = content.lastIndexOf("\n", index - 1) + 1;
  return content.slice(start, index).match(/^[ \t]*/)?.[0] ?? "";
}

function indentBlock(block: string, extra: string): string {
  return block
    .split("\n")
    .map((line) => (line.trim() ? `${extra}${line}` : line))
    .join("\n");
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function readWord(content: string, index: number): string {
  let end = index + 1;
  while (end < content.length && isWordChar(content[end] ?? "")) end += 1;
  return content.slice(index, end);
}
