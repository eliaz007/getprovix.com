import ts from "typescript";

/**
 * AST scan: `"use server"` functions that hit Supabase DB APIs without
 * `supabase.auth.getUser()`. Uses the TypeScript compiler API only (no exec).
 */

export type UseServerSupabaseAuthViolation = {
  filePath: string;
  line: number;
  message: string;
  /** Exported / declared name when available. */
  functionName: string | null;
};

export type UseServerSupabaseAuthScanFile = {
  filePath: string;
  content: string;
};

const DB_METHOD_NAMES = new Set(["from", "rpc"]);

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function isUseServerLiteral(node: ts.Expression): boolean {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === "use server"
  );
}

/** File-level `"use server"` as the first statement (after shebang / empty). */
export function hasFileLevelUseServer(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && isUseServerLiteral(statement.expression)) {
      return true;
    }
    // Directives must lead the file; anything else ends the search.
    break;
  }
  return false;
}

/** Function-body `"use server"` as the first statement. */
function hasFunctionLevelUseServer(body: ts.ConciseBody | undefined): boolean {
  if (!body || !ts.isBlock(body)) return false;
  for (const statement of body.statements) {
    if (ts.isExpressionStatement(statement) && isUseServerLiteral(statement.expression)) {
      return true;
    }
    break;
  }
  return false;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/**
 * Walk a call / property chain and collect property names from the right
 * (e.g. `supabase.from("t").select()` → ["select", "from"] with receiver).
 */
function unwrapCallChain(expr: ts.Expression): {
  properties: string[];
  root: ts.Expression;
} {
  const properties: string[] = [];
  let current: ts.Expression = expr;

  while (true) {
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(current)) {
      properties.push(current.name.text);
      current = current.expression;
      continue;
    }
    if (ts.isElementAccessExpression(current) && ts.isStringLiteralLike(current.argumentExpression)) {
      properties.push(current.argumentExpression.text);
      current = current.expression;
      continue;
    }
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isNonNullExpression(current) || ts.isAwaitExpression(current)) {
      current = current.expression;
      continue;
    }
    break;
  }

  return { properties, root: current };
}

function isAuthGetUserCall(node: ts.CallExpression): boolean {
  // supabase.auth.getUser(...)  or  client.auth.getUser()
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "getUser") return false;
  const auth = node.expression.expression;
  if (!ts.isPropertyAccessExpression(auth)) return false;
  return auth.name.text === "auth";
}

function isSupabaseDbCall(node: ts.CallExpression): boolean {
  // *.from(...) or *.rpc(...) — including after await / paren / chain root.
  if (!ts.isPropertyAccessExpression(node.expression) && !ts.isElementAccessExpression(node.expression)) {
    return false;
  }
  const { properties } = unwrapCallChain(node);
  // Innermost method on the call we are inspecting is the first pushed name
  // when walking from this CallExpression's expression — but unwrap starts at
  // the call itself, so properties[0] is the method being invoked.
  const method = properties[0];
  return method !== undefined && DB_METHOD_NAMES.has(method);
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

function functionNameOf(node: FunctionLike, fallback: string | null = null): string | null {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) {
    return node.name && ts.isIdentifier(node.name) ? node.name.text : fallback;
  }
  return fallback;
}

function getFunctionBody(node: FunctionLike): ts.ConciseBody | undefined {
  return node.body;
}

type FunctionTarget = {
  node: FunctionLike;
  name: string | null;
  /** True when this function itself carries `"use server"` or is an export in a use-server file. */
  isServerAction: boolean;
};

function collectExportedFunctionLikes(sourceFile: ts.SourceFile, fileLevelUseServer: boolean): FunctionTarget[] {
  const targets: FunctionTarget[] = [];

  const consider = (node: FunctionLike, name: string | null, isExported: boolean) => {
    const body = getFunctionBody(node);
    const functionDirective = hasFunctionLevelUseServer(body);
    const isServerAction = functionDirective || (fileLevelUseServer && isExported);
    if (!isServerAction) return;
    targets.push({ node, name, isServerAction });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)) {
      const isExported =
        Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        // `export default function` uses DefaultKeyword + ExportKeyword
        Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
      consider(node, functionNameOf(node, node.name?.text ?? "default"), isExported);
    } else if (ts.isVariableStatement(node)) {
      const isExported = Boolean(
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      );
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const init = decl.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          consider(init, decl.name.text, isExported);
        }
      }
    } else if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const expr = node.expression;
      if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        consider(expr, "default", true);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return targets;
}

function analyzeFunction(
  sourceFile: ts.SourceFile,
  filePath: string,
  target: FunctionTarget
): UseServerSupabaseAuthViolation | null {
  const body = getFunctionBody(target.node);
  if (!body) return null;

  let callsGetUser = false;
  // Collected via nested walk — keep a mutable box so TS does not treat the
  // outer binding as always-null after the closure assignment.
  const dbState: { call: ts.CallExpression | null } = { call: null };

  const walk = (node: ts.Node) => {
    // Nested function declarations/expressions have their own scope — only
    // count auth/DB calls that belong to *this* server action body.
    if (
      node !== target.node &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }

    if (ts.isCallExpression(node)) {
      if (isAuthGetUserCall(node)) callsGetUser = true;
      if (!dbState.call && isSupabaseDbCall(node)) dbState.call = node;
    }

    ts.forEachChild(node, walk);
  };

  walk(body);

  const firstDbCall = dbState.call;
  if (!firstDbCall || callsGetUser) return null;

  // Prefer the `.from` / `.rpc` property location so multiline
  // `await supabase\n  .from(...)` reports the method line.
  const dbMethodNode =
    ts.isPropertyAccessExpression(firstDbCall.expression) ||
    ts.isElementAccessExpression(firstDbCall.expression)
      ? firstDbCall.expression
      : firstDbCall;
  const lineAnchor =
    ts.isPropertyAccessExpression(dbMethodNode) ? dbMethodNode.name : dbMethodNode;
  const line = lineOf(sourceFile, lineAnchor);
  const name = target.name;
  const nameLabel = name ? `\`${name}\`` : "an anonymous server action";

  return {
    filePath,
    line,
    functionName: name,
    message:
      `${nameLabel} is a "use server" action that performs a Supabase database ` +
      `operation (line ${line}) without calling supabase.auth.getUser(). ` +
      `Authenticate the session with supabase.auth.getUser() before .from() / .rpc().`,
  };
}

/**
 * Scan one source file for `"use server"` functions that query Supabase
 * without `auth.getUser()`.
 */
export function scanSourceForUseServerSupabaseAuth(
  filePath: string,
  content: string
): UseServerSupabaseAuthViolation[] {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const sourceFile = ts.createSourceFile(
    normalizedPath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(normalizedPath)
  );

  const fileLevel = hasFileLevelUseServer(sourceFile);
  const targets = collectExportedFunctionLikes(sourceFile, fileLevel);
  const violations: UseServerSupabaseAuthViolation[] = [];

  for (const target of targets) {
    const violation = analyzeFunction(sourceFile, normalizedPath, target);
    if (violation) violations.push(violation);
  }

  return violations;
}

/** Scan multiple in-memory files (firewall / vitest style). */
export function scanFilesForUseServerSupabaseAuth(
  files: readonly UseServerSupabaseAuthScanFile[]
): UseServerSupabaseAuthViolation[] {
  return files.flatMap((file) => scanSourceForUseServerSupabaseAuth(file.filePath, file.content));
}
