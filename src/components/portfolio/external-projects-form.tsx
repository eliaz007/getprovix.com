"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  FolderKanban,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { ExternalProjectRecord } from "@/lib/external-projects";
import {
  hasUsableExternalProjects,
  normalizeExternalProjects,
} from "@/lib/external-projects";
import { createClient } from "@/utils/supabase/client";

const inputClass =
  "w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-brand";

const labelClass =
  "block text-[11px] font-bold text-textMuted mb-2 uppercase tracking-wide";

function AlternativeArtifactsTrustNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-border bg-background px-3.5 py-3 ${className}`}
      role="note"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-textMuted">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-textMuted" aria-hidden />
        Security & Privacy
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-textMuted">
        <li>Technical breakdowns are ephemeral.</li>
        <li>Never stored permanently for third-party access.</li>
        <li>Never used to train public AI models.</li>
      </ul>
    </div>
  );
}

type ExternalProjectsFormProps = {
  onProjectsChange?: (projects: ExternalProjectRecord[]) => void;
};

export default function ExternalProjectsForm({
  onProjectsChange,
}: ExternalProjectsFormProps) {
  const [projects, setProjects] = useState<ExternalProjectRecord[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const publishProjects = useCallback(
    (next: ExternalProjectRecord[]) => {
      setProjects(next);
      onProjectsChange?.(next);
    },
    [onProjectsChange]
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (!user) {
        setSignedIn(false);
        setLoading(false);
        publishProjects([]);
        return;
      }

      setSignedIn(true);

      const { data, error: loadError } = await supabase
        .from("external_projects")
        .select("id, project_title, project_url, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (loadError) {
        console.error("[external-projects] load failed:", loadError);
        setError("Could not load saved project artifacts.");
        setLoading(false);
        return;
      }

      publishProjects(normalizeExternalProjects(data));
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [publishProjects]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) {
      return;
    }

    const project_title = title.trim();
    const project_url = url.trim();
    const descriptionValue = description.trim();

    if (!project_title) {
      setError("Add a project name.");
      return;
    }

    if (!project_url && !descriptionValue) {
      setError("Add a live/documentation URL or a technical breakdown.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSignedIn(false);
        setError("Sign in to save project artifacts.");
        return;
      }

      const { data, error: insertError } = await supabase
        .from("external_projects")
        .insert({
          user_id: user.id,
          project_title,
          project_url,
          description: descriptionValue,
        })
        .select("id, project_title, project_url, description, created_at")
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const saved = normalizeExternalProjects(data ? [data] : []);
      publishProjects([...saved, ...projects]);
      setTitle("");
      setUrl("");
      setDescription("");
      setNotice("Project artifact saved. The AI auditor can use it when GitHub is private.");
    } catch (err) {
      console.error("[external-projects] insert failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not save this project. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (deletingId) {
      return;
    }

    setDeletingId(projectId);
    setError(null);
    setNotice(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("external_projects")
        .delete()
        .eq("id", projectId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      publishProjects(projects.filter((project) => project.id !== projectId));
    } catch (err) {
      console.error("[external-projects] delete failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not remove this project. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (signedIn === false) {
    return (
      <div className="rounded-xl border border-border bg-background px-4 py-4">
        <div className="flex items-start gap-3">
          <FolderKanban
            className="mt-0.5 h-4 w-4 shrink-0 text-brand"
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-textMain">
              Alternative project artifacts
            </p>
            <p className="mt-1 text-xs leading-relaxed text-textMuted">
              Sign in to save live demos, docs, and technical breakdowns for
              private or enterprise work. The AI auditor will use these when a
              public GitHub repository is not available.
            </p>
            <AlternativeArtifactsTrustNotice className="mt-3" />
            <Link
              href="/login"
              className="mt-3 inline-flex text-xs font-semibold text-brand hover:text-brand"
            >
              Sign in to add projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-textMuted">
          <FolderKanban className="h-3.5 w-3.5 text-brand" aria-hidden />
          Alternative project artifacts
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-textMuted">
          For private, enterprise, or otherwise unpublished work, add a live or
          documentation URL plus a technical breakdown. The auditor uses these
          instead of failing on a missing public GitHub repo.
        </p>
        <AlternativeArtifactsTrustNotice className="mt-3" />
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div>
          <label htmlFor="external-project-title" className={labelClass}>
            Project Name
          </label>
          <input
            id="external-project-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Payments ledger service"
            className={inputClass}
            disabled={saving || loading}
          />
        </div>

        <div>
          <label htmlFor="external-project-url" className={labelClass}>
            Live / Documentation URL
          </label>
          <input
            id="external-project-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://docs.example.com/architecture"
            className={`${inputClass} font-mono`}
            disabled={saving || loading}
          />
        </div>

        <div>
          <label htmlFor="external-project-description" className={labelClass}>
            Technical Breakdown / Description
          </label>
          <textarea
            id="external-project-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Stack, architecture, your ownership, APIs, data model, and production constraints."
            className={`${inputClass} resize-y leading-relaxed`}
            disabled={saving || loading}
          />
        </div>

        {error ? (
          <p className="text-xs text-rose-400" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-xs text-emerald-400" role="status">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving || loading || signedIn !== true}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-xs font-bold tracking-tight text-white transition-colors duration-200 ease-out hover:bg-brandHover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving project...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden />
              Save project artifact
            </>
          )}
        </button>
      </form>

      <div className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-textMuted">
          Saved artifacts
          {hasUsableExternalProjects(projects)
            ? ` (${projects.length})`
            : ""}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-xs text-textMuted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading saved projects...
          </div>
        ) : projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-3 text-xs leading-relaxed text-textMuted">
            No alternative artifacts yet. Save a project above to give the
            auditor something to evaluate when GitHub is private.
          </p>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li
                key={project.id ?? `${project.project_title}-${project.project_url}`}
                className="rounded-xl border border-border bg-background px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-textMain">
                      {project.project_title || "Untitled project"}
                    </p>
                    {project.project_url ? (
                      <a
                        href={project.project_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] font-mono text-brand hover:text-brand"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{project.project_url}</span>
                      </a>
                    ) : null}
                  </div>
                  {project.id ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(project.id as string)}
                      disabled={deletingId === project.id}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-textMuted transition-colors hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
                      aria-label={`Remove ${project.project_title || "project"}`}
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  ) : null}
                </div>
                {project.description ? (
                  <p className="mt-2 text-xs leading-relaxed text-textMuted">
                    {project.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
