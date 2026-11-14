import ts from "typescript";

/**
 * Detect and surgically rewrite server-side `supabase.auth.getSession()` →
 * `supabase.auth.getUser()`, including common `{ data: { session } }` destructuring.
 *
 * getSession() reads the local JWT without revalidating with Auth. On the server
 * (Server Actions, Route Handlers, middleware), getUser() is required.
 */

export const INSECURE_AUTH_SESSION_RULE = "Insecure getSession Auth";

export const GET_SESSION_MESSAGE =
  "Server-side code calls supabase.auth.getSession(), which trusts the local JWT without revalidation. Use supabase.auth.getUser() instead.";

/** Session fields that cannot map 1:1 onto getUser()'s `{ user }` payload. */
const SESSION_ONLY_PROPS = new Set([
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "token_type",
  "provider_token",
  "provider_refresh_token",
]);

export type GetSessionOccurrence = {
  filePath: string;
  line: number;
  /** Start of the `getSession` identifier. */
  callNameStart: number;
  callNameEnd: number;
  snippet: string;
  /** True when destructuring + references can be rewritten safely. */
  autofixable: boolean;
  /** Binding name for the session object, when destructured as `{ data: { session } }`. */
  sessionBinding: string | null;
};

type TextEdit = { start: number; end: number; text: string };

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function hasLeadingDirective(content: string, directive: "use client" | "use server"): boolean {
  const head = content.replace(/^\uFEFF/, "").slice(0, 800);
  const pattern =
    directive === "use client"
      ? /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*['"]use client['"]/
      : /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*['"]use server['"]/;
  return pattern.test(head);
}

/**
 * Server Actions, Route Handlers, middleware/proxy, App Router API routes,
 * or modules that create a server Supabase client. Skips pure client components.
 */
export function isServerSideAuthFile(filePath: string, content: string): boolean {
  const path = normalizePath(filePath);
  const base = path.split("/").pop() ?? path;

  if (hasLeadingDirective(content, "use client") && !hasLeadingDirective(content, "use server")) {
    return false;
  }

  if (hasLeadingDirective(content, "use server")) return true;
  if (/\/route\.(?:ts|tsx|js|jsx)$/i.test(path)) return true;
  if (/^(?:src\/)?middleware\.(?:ts|js)$/i.test(path) || base === "middleware.ts" || base === "middleware.js") {
    return true;
  }
  if (/^(?:src\/)?proxy\.(?:ts|js)$/i.test(path) || base === "proxy.ts" || base === "proxy.js") {
    return true;
  }
  if (/\/(?:src\/)?app\/api\//i.test(path) || /\/pages\/api\//i.test(path)) return true;
  if (/from\s+['"]@\/utils\/supabase\/server['"]/.test(content)) return true;
  if (/from\s+['"]@\/utils\/supabase\/middleware['"]/.test(content)) return true;
  if (/\bcreateServerClient\b|\bcreateServerComponentClient\b/.test(content)) return true;

  return false;
}

function isAuthGetSessionCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "getSession") return false;
  const auth = node.expression.expression;
  if (!ts.isPropertyAccessExpression(auth)) return false;
  return auth.name.text === "auth";
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function snippetAround(content: string, start: number, end: number): string {
  const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIdx = content.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
  return content.slice(lineStart, lineEnd).trim().slice(0, 180);
}

/**
 * Walk up from a CallExpression / AwaitExpression to a VariableDeclaration
 * that destructures `{ data: { session } }` (or aliased).
 */
function findSessionBinding(
  call: ts.CallExpression
): { bindingName: string; bindingNode: ts.BindingElement } | null {
  let current: ts.Node = call;
  // await supabase.auth.getSession()
  if (ts.isAwaitExpression(current.parent) && current.parent.expression === current) {
    current = current.parent;
  }
  // const { ... } = await ...
  if (!ts.isVariableDeclaration(current.parent) || current.parent.initializer !== current) {
    return null;
  }
  const name = current.parent.name;
  if (!ts.isObjectBindingPattern(name)) return null;

  for (const dataEl of name.elements) {
    if (dataEl.dotDotDotToken) continue;
    const dataKey =
      dataEl.propertyName && ts.isIdentifier(dataEl.propertyName)
        ? dataEl.propertyName.text
        : ts.isIdentifier(dataEl.name)
          ? dataEl.name.text
          : null;
    if (dataKey !== "data") continue;
    if (!ts.isObjectBindingPattern(dataEl.name)) continue;
    for (const sessionEl of dataEl.name.elements) {
      if (sessionEl.dotDotDotToken) continue;
      const sessionKey =
        sessionEl.propertyName && ts.isIdentifier(sessionEl.propertyName)
          ? sessionEl.propertyName.text
          : ts.isIdentifier(sessionEl.name)
            ? sessionEl.name.text
            : null;
      if (sessionKey !== "session") continue;
      if (!ts.isIdentifier(sessionEl.name)) continue;
      return { bindingName: sessionEl.name.text, bindingNode: sessionEl };
    }
  }
  return null;
}

function enclosingFunction(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      return current;
    }
    if (ts.isSourceFile(current)) return current;
    current = current.parent;
  }
  return node.getSourceFile();
}

function collectBindingUsages(
  scope: ts.Node,
  bindingName: string,
  bindingNode: ts.BindingElement
): {
  safe: boolean;
  userPropAccesses: ts.PropertyAccessExpression[];
  optionalUserAccesses: ts.PropertyAccessExpression[];
  identifiers: ts.Identifier[];
} {
  const userPropAccesses: ts.PropertyAccessExpression[] = [];
  const optionalUserAccesses: ts.PropertyAccessExpression[] = [];
  const identifiers: ts.Identifier[] = [];
  let safe = true;

  const visit = (node: ts.Node) => {
    if (node === bindingNode) {
      ts.forEachChild(node, visit);
      return;
    }
    // Nested functions introduce a new scope — skip (binding is const in outer).
    if (
      node !== scope &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === bindingName) {
      if (SESSION_ONLY_PROPS.has(node.name.text)) {
        safe = false;
      } else if (node.name.text === "user") {
        if (node.questionDotToken) optionalUserAccesses.push(node);
        else userPropAccesses.push(node);
      } else {
        // e.g. session.user metadata via other props on Session — treat as unsafe
        // except we already handled .user. Unknown props → unsafe.
        safe = false;
      }
      return;
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === bindingName
    ) {
      safe = false;
      return;
    }

    if (ts.isIdentifier(node) && node.text === bindingName) {
      // Skip property name positions: { session: ... } keys, etc.
      if (
        ts.isPropertyAssignment(node.parent) &&
        node.parent.name === node
      ) {
        return;
      }
      if (
        ts.isBindingElement(node.parent) &&
        (node.parent.name === node || node.parent.propertyName === node)
      ) {
        return;
      }
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
        return;
      }
      identifiers.push(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(scope);
  return { safe, userPropAccesses, optionalUserAccesses, identifiers };
}

function applyEdits(content: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let next = content;
  let lastStart = Infinity;
  for (const edit of sorted) {
    if (edit.end > lastStart) continue; // overlapping — keep earlier (higher) edit
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
    lastStart = edit.start;
  }
  return next;
}

export function findGetSessionOccurrences(
  filePath: string,
  content: string
): GetSessionOccurrence[] {
  const normalized = normalizePath(filePath);
  if (!/\.(?:ts|tsx|js|jsx|mts|cts)$/i.test(normalized)) return [];
  if (!isServerSideAuthFile(normalized, content)) return [];
  if (!content.includes("getSession")) return [];

  const sourceFile = ts.createSourceFile(
    normalized,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(normalized)
  );

  const occurrences: GetSessionOccurrence[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isAuthGetSessionCall(node)) {
      const nameNode = (node.expression as ts.PropertyAccessExpression).name;
      const binding = findSessionBinding(node);
      let autofixable = true;
      if (binding) {
        const scope = enclosingFunction(node);
        const usage = collectBindingUsages(scope, binding.bindingName, binding.bindingNode);
        autofixable = usage.safe;
      } else {
        // Bare getSession() without `{ data: { session } }` — still rename the call.
        // If callers use `.data.session`, they need a follow-up; mark unsafe when
        // the call result's `.session` is read in a simple parent property chain.
        let parent: ts.Node = node;
        if (ts.isAwaitExpression(node.parent)) parent = node.parent;
        if (
          ts.isPropertyAccessExpression(parent.parent) &&
          parent.parent.expression === parent &&
          parent.parent.name.text === "data"
        ) {
          const dataAccess = parent.parent;
          if (
            ts.isPropertyAccessExpression(dataAccess.parent) &&
            dataAccess.parent.expression === dataAccess &&
            dataAccess.parent.name.text === "session"
          ) {
            // `(await ..getSession()).data.session` — autofixable via rewriting to .data.user
            autofixable = true;
          }
        }
      }

      occurrences.push({
        filePath: normalized,
        line: lineOf(sourceFile, nameNode.getStart(sourceFile)),
        callNameStart: nameNode.getStart(sourceFile),
        callNameEnd: nameNode.getEnd(),
        snippet: snippetAround(content, nameNode.getStart(sourceFile), nameNode.getEnd()),
        autofixable,
        sessionBinding: binding?.bindingName ?? null,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return occurrences;
}

/**
 * Rewrite one (or all) server-side getSession call(s) to getUser with destructuring fixes.
 * Returns null when nothing changes or the target line is not autofixable.
 */
export function rewriteGetSessionToGetUser(
  content: string,
  filePath: string,
  targetLine?: number
): { content: string; changed: boolean; line: number } | null {
  const normalized = normalizePath(filePath);
  const occurrences = findGetSessionOccurrences(normalized, content).filter((item) =>
    targetLine === undefined ? item.autofixable : item.line === targetLine && item.autofixable
  );
  if (occurrences.length === 0) return null;

  const sourceFile = ts.createSourceFile(
    normalized,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(normalized)
  );

  const edits: TextEdit[] = [];
  const targets = new Set(occurrences.map((item) => item.callNameStart));

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isAuthGetSessionCall(node)) {
      const nameNode = (node.expression as ts.PropertyAccessExpression).name;
      const nameStart = nameNode.getStart(sourceFile);
      if (!targets.has(nameStart)) {
        ts.forEachChild(node, visit);
        return;
      }

      edits.push({ start: nameStart, end: nameNode.getEnd(), text: "getUser" });

      const binding = findSessionBinding(node);
      if (binding) {
        const scope = enclosingFunction(node);
        const usage = collectBindingUsages(scope, binding.bindingName, binding.bindingNode);

        // `{ data: { session } }` or `{ data: { session: alias } }` → `{ data: { user } }`
        edits.push({
          start: binding.bindingNode.getStart(sourceFile),
          end: binding.bindingNode.getEnd(),
          text: "user",
        });

        for (const access of [...usage.userPropAccesses, ...usage.optionalUserAccesses]) {
          edits.push({
            start: access.getStart(sourceFile),
            end: access.getEnd(),
            text: "user",
          });
        }

        for (const id of usage.identifiers) {
          // Skip ids that are part of session.user (already replaced as whole access)
          const parent = id.parent;
          if (
            ts.isPropertyAccessExpression(parent) &&
            parent.expression === id &&
            parent.name.text === "user"
          ) {
            continue;
          }
          edits.push({
            start: id.getStart(sourceFile),
            end: id.getEnd(),
            text: "user",
          });
        }
      } else {
        // `(await client.auth.getSession()).data.session` → `.data.user`
        let expr: ts.Node = node;
        if (ts.isAwaitExpression(node.parent) && node.parent.expression === node) {
          expr = node.parent;
        }
        while (ts.isParenthesizedExpression(expr.parent) && expr.parent.expression === expr) {
          expr = expr.parent;
        }
        if (
          ts.isPropertyAccessExpression(expr.parent) &&
          expr.parent.expression === expr &&
          expr.parent.name.text === "data"
        ) {
          const dataAccess = expr.parent;
          if (
            ts.isPropertyAccessExpression(dataAccess.parent) &&
            dataAccess.parent.expression === dataAccess &&
            dataAccess.parent.name.text === "session"
          ) {
            edits.push({
              start: dataAccess.parent.name.getStart(sourceFile),
              end: dataAccess.parent.name.getEnd(),
              text: "user",
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (edits.length === 0) return null;

  const next = applyEdits(content, edits);
  if (next === content) return null;
  return {
    content: next,
    changed: true,
    line: occurrences[0]?.line ?? targetLine ?? 1,
  };
}

/** Build a unified diff hunk for remediation display. */
export function getSessionRemediationDiff(
  filePath: string,
  before: string,
  after: string,
  line: number
): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const beforeLine = beforeLines[line - 1] ?? "";
  const afterLine = afterLines[line - 1] ?? beforeLine;
  return [
    `--- a/${normalizePath(filePath)}`,
    `+++ b/${normalizePath(filePath)}`,
    `@@ -${line} +${line} @@`,
    `-${beforeLine}`,
    `+${afterLine}`,
  ].join("\n");
}
