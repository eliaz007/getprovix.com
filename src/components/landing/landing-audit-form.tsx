"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LandingAuditForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(`/audit?repo=${encodeURIComponent(repoUrl.trim())}`);
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-10 w-full max-w-3xl">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-2 sm:flex-row sm:items-stretch">
        <label htmlFor="github" className="sr-only">
          Paste GitHub Profile or Repo URL
        </label>
        <input
          id="github"
          name="repo"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="Paste GitHub Profile or Repo URL"
          className="min-h-14 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3.5 font-mono text-sm text-textMain placeholder:text-textMuted outline-none transition-colors duration-200 focus:border-brand sm:text-[15px]"
        />
        <button
          type="submit"
          className="inline-flex min-h-14 shrink-0 items-center justify-center rounded-xl border border-border bg-brand text-white px-6 text-sm font-bold tracking-tight transition-colors duration-200 hover:bg-brandHover cursor-pointer"
        >
          Run Production Audit
        </button>
      </div>
    </form>
  );
}
