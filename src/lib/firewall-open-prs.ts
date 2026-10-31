import { createServiceRoleClient } from "@/lib/admin-access";
import { healingAuditCategory, toHealingAuditEntry, type HealingAuditEntry } from "@/lib/healing-audit";
import { toGitHubOwnerRepo } from "@/lib/github-repo-ref";

const OPEN_STATUSES = ["open", "pending"] as const;

export type OpenAutofixPullRequest = {
  owner: string;
  repo: string;
  filePath: string;
  number?: number;
  url?: string;
  branch?: string;
  commitMessage?: string;
};

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export async function recordOpenAutofixPullRequest(input: OpenAutofixPullRequest): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const { error } = await admin.from("firewall_autofix_pull_requests").upsert(
    {
      owner: input.owner,
      repo: input.repo,
      file_path: normalizeFilePath(input.filePath),
      status: "open",
      pull_number: input.number ?? null,
      pull_url: input.url ?? null,
      branch: input.branch ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner,repo,file_path" }
  );
  if (error) {
    console.error("[autofix/pr] could not record the open pull request", error.message);
  }

  const filePath = normalizeFilePath(input.filePath);
  const branch = input.branch ?? null;
  const { error: auditError } = await admin.from("healing_audits").insert({
    file_path: filePath,
    branch_name: branch,
    category: healingAuditCategory(branch),
    status: "open",
    commit_message: input.commitMessage ?? null,
  });
  if (auditError) {
    console.error("[autofix/pr] could not record the healing audit", auditError.message);
  }
}

export type ListedAutofixPull = {
  filePath: string;
  number: number | null;
  url: string | null;
  branch: string | null;
};

function isArchitectureAutofixBranch(branch: string | null): boolean {
  if (!branch) return true;
  return !branch.startsWith("provix/security-");
}

export async function listOpenAutofixPulls(repoInput: string): Promise<ListedAutofixPull[]> {
  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const [owner, repo] = ownerRepo?.split("/") ?? [];
  if (!owner || !repo) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("firewall_autofix_pull_requests")
    .select("file_path, pull_number, pull_url, branch")
    .eq("owner", owner)
    .eq("repo", repo)
    .in("status", [...OPEN_STATUSES]);
  if (error || !data) return [];
  return data.flatMap((row) => {
    const filePath = typeof row.file_path === "string" ? normalizeFilePath(row.file_path) : "";
    if (!filePath) return [];
    const branch = typeof row.branch === "string" ? row.branch : null;
    if (!isArchitectureAutofixBranch(branch)) return [];
    const number = typeof row.pull_number === "number" ? row.pull_number : null;
    const url = typeof row.pull_url === "string" && row.pull_url.length > 0 ? row.pull_url : null;
    return [{ filePath, number, url, branch }];
  });
}

async function healNotesByPath(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>
): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  const { data, error } = await admin
    .from("healing_audits")
    .select("file_path, branch_name, commit_message")
    .order("created_at", { ascending: false });
  if (error || !data) return notes;
  for (const row of data) {
    const filePath = typeof row.file_path === "string" ? normalizeFilePath(row.file_path) : "";
    const message = typeof row.commit_message === "string" ? row.commit_message.trim() : "";
    if (!filePath || !message) continue;
    const branch = typeof row.branch_name === "string" ? row.branch_name : "";
    if (branch && !notes.has(`${filePath}|${branch}`)) notes.set(`${filePath}|${branch}`, message);
    if (!notes.has(filePath)) notes.set(filePath, message);
  }
  return notes;
}

export async function listAutofixHistory(repoInput: string): Promise<HealingAuditEntry[]> {
  const ownerRepo = toGitHubOwnerRepo(repoInput);
  const [owner, repo] = ownerRepo?.split("/") ?? [];
  if (!owner || !repo) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("firewall_autofix_pull_requests")
    .select("file_path, status, branch, pull_number, created_at, updated_at")
    .eq("owner", owner)
    .eq("repo", repo)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const notes = await healNotesByPath(admin);
  return data.flatMap((row) => {
    const entry = toHealingAuditEntry(row);
    if (!entry) return [];
    const branch = typeof row.branch === "string" ? row.branch : "";
    const note = (branch ? notes.get(`${entry.filePath}|${branch}`) : undefined) ?? notes.get(entry.filePath) ?? null;
    return [note ? { ...entry, note } : entry];
  });
}

export type HealingAuditRow = {
  id: string;
  file_path: string;
  branch_name: string | null;
  category: "violations" | "leaks";
  status: string;
  commit_message: string | null;
  created_at: string;
};

function mapAutofixToHealingAuditRows(
  data: Array<{
    id?: unknown;
    file_path?: unknown;
    branch?: unknown;
    status?: unknown;
    created_at?: unknown;
  }>
): HealingAuditRow[] {
  return data.flatMap((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const filePath = typeof row.file_path === "string" ? normalizeFilePath(row.file_path) : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (!id || !filePath || !createdAt) return [];
    const branch = typeof row.branch === "string" ? row.branch : null;
    const status = typeof row.status === "string" ? row.status : "open";
    return [
      {
        id,
        file_path: filePath,
        branch_name: branch,
        category: healingAuditCategory(branch),
        status,
        commit_message: null,
        created_at: createdAt,
      },
    ];
  });
}

/** Prefer `healing_audits`; fall back to autofix PR rows when the table is empty or missing. */
export async function listHealingAuditRows(): Promise<HealingAuditRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const audits = await admin.from("healing_audits").select("*").order("created_at", { ascending: false });
  if (!audits.error && Array.isArray(audits.data) && audits.data.length > 0) {
    return audits.data.flatMap((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const filePath = typeof row.file_path === "string" ? normalizeFilePath(row.file_path) : "";
      const createdAt = typeof row.created_at === "string" ? row.created_at : "";
      if (!id || !filePath || !createdAt) return [];
      const category = row.category === "leaks" ? "leaks" : "violations";
      return [
        {
          id,
          file_path: filePath,
          branch_name: typeof row.branch_name === "string" ? row.branch_name : null,
          category,
          status: typeof row.status === "string" ? row.status : "open",
          commit_message: typeof row.commit_message === "string" ? row.commit_message : null,
          created_at: createdAt,
        },
      ];
    });
  }

  const { data, error } = await admin
    .from("firewall_autofix_pull_requests")
    .select("id, file_path, branch, status, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return mapAutofixToHealingAuditRows(data);
}

export async function listOpenAutofixFiles(repoInput: string): Promise<string[]> {
  const pulls = await listOpenAutofixPulls(repoInput);
  return pulls.map((pull) => pull.filePath);
}
