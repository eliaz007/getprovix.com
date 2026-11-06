import { describe, expect, it, vi } from "vitest";
import {
  agenticFixWithRetry,
  mergePreservingServerExports,
  type AgenticFixGenerate,
} from "@/lib/agentic-fix-with-retry";

const finding = {
  filePath: "src/components/jobs.tsx",
  line: 3,
  category: "CLIENT_DB_EXPOSURE",
  snippet: 'supabase.from("jobs").select("*")',
};

const source = `"use client";
export async function load() {
  return supabase.from("jobs").select("*");
}
`;

function patch(client: string, action: string): string {
  return JSON.stringify({
    writes: [
      { filePath: "src/components/jobs.tsx", content: client },
      { filePath: "src/app/actions/secure-query.ts", content: action },
    ],
  });
}

const failingAction = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery3() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase.from("jobs").select("*");
  void notDefined;
  void alsoMissing;
  return { data, error };
}
`;

const passingClient = `"use client";
// attempt-2
import { secureQuery3 } from "@/app/actions/secure-query";
export async function load() {
  return await secureQuery3();
}
`;

const passingAction = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery3() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { message: "Unauthorized" } };
  }
  const { data, error } = await supabase.from("jobs").select("*");
  return { data, error };
}
`;

describe("mergePreservingServerExports", () => {
  it("appends a new action and keeps existing secureQuery exports", () => {
    const existing = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery184() {
  return { data: null, error: null };
}
`;
    const generated = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function getAuditorProfile() {
  return { data: null, error: null };
}
`;
    const merged = mergePreservingServerExports(existing, generated);
    expect(merged).toMatch(/function secureQuery184\b/);
    expect(merged).toMatch(/function getAuditorProfile\b/);
  });
});

describe("agenticFixWithRetry", () => {
  it("returns the second attempt after the first patch fails preflight", async () => {
    const generate = vi.fn<AgenticFixGenerate>(async (prompt) => {
      if (generate.mock.calls.length === 1) return patch(`"use client";\nexport async function load() { return 1; }\n`, failingAction);
      expect(prompt).toMatch(/notDefined|tsc --noEmit|Pre-flight/i);
      return patch(passingClient, passingAction);
    });

    const result = await agenticFixWithRetry(
      { finding, content: source, existingServerAction: null },
      { generate }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toMatch(/alsoMissing/);
    expect(result.writes.some((write) => write.content.includes("// attempt-2"))).toBe(true);
    expect(result.writes.some((write) => write.content.includes("void notDefined"))).toBe(false);
  }, 120_000);

  it("keeps existing server exports when the model replaces the action file", async () => {
    const existing = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function secureQuery184() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { message: "Unauthorized" } };
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id);
  return { data, error };
}
`;
    const generated = `"use server";

import { createClient } from "@/utils/supabase/server";

export async function getAuditorProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { message: "Unauthorized" } };
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id);
  return { data, error };
}
`;
    const client = `"use client";
import { getAuditorProfile } from "@/app/actions/secure-query";
export async function load() {
  return await getAuditorProfile();
}
`;
    const generate = vi.fn<AgenticFixGenerate>(async () => patch(client, generated));
    const result = await agenticFixWithRetry(
      { finding, content: source, existingServerAction: existing },
      { generate }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const action = result.writes.find((write) => write.filePath.endsWith("secure-query.ts"));
    expect(action?.content).toMatch(/function secureQuery184\b/);
    expect(action?.content).toMatch(/function getAuditorProfile\b/);
  }, 90_000);

  it("returns a quiet failure when all 3 attempts fail preflight", async () => {
    const generate = vi.fn<AgenticFixGenerate>(async () =>
      patch(`"use client";\nexport async function load() { return 1; }\n`, failingAction)
    );

    const result = await agenticFixWithRetry(
      { finding, content: source, existingServerAction: null },
      { generate }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.attempts).toBe(3);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.message.length).toBeGreaterThan(0);
  }, 180_000);

  it("rejects a secret patch that still contains the key, then accepts the retry", async () => {
    const secret = `sk_live_${"a".repeat(24)}`;
    const source = `export const key = "${secret}";\n`;
    const finding = {
      filePath: "src/lib/billing-key.ts",
      line: 1,
      category: "SECRET_LEAK",
      snippet: "sk_live_...",
    };
    const generate = vi.fn<AgenticFixGenerate>(async (prompt) => {
      if (generate.mock.calls.length === 1) {
        return JSON.stringify({
          writes: [{ filePath: "src/lib/billing-key.ts", content: source }],
        });
      }
      expect(prompt).toMatch(/hardcoded secret/i);
      return JSON.stringify({
        writes: [
          {
            filePath: "src/lib/billing-key.ts",
            content: "export const key = process.env.STRIPE_SECRET_KEY;\n",
          },
        ],
      });
    });

    const result = await agenticFixWithRetry(
      { finding, content: source, existingEnvExample: null },
      { generate }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(result.writes.some((write) => write.content.includes(secret))).toBe(false);
    expect(result.writes.some((write) => write.content.includes("process.env.STRIPE_SECRET_KEY"))).toBe(true);
  }, 90_000);

  it("accepts a multi-file component split after a one-file patch is rejected", async () => {
    const source = `"use client";

import { useState } from "react";

export function JobBoard() {
  const title = "Open roles";
  function Heading() {
    return title;
  }
  const [open, setOpen] = useState(true);
  return Heading() + String(open) + String(setOpen);
}
`;
    const finding = {
      filePath: "src/components/job-board.tsx",
      line: 1,
      category: "ARCHITECTURAL_BLOAT",
      snippet: "No safe top-level split.",
    };
    const barrel = `"use client";

export { JobBoard } from "./job-board/board";
`;
    const board = `"use client";

import { useState } from "react";
import { Heading } from "./heading";

export function JobBoard() {
  const title = "Open roles";
  const [open, setOpen] = useState(true);
  return Heading(title) + String(open) + String(setOpen);
}
`;
    const heading = `"use client";

export function Heading(title: string) {
  return title;
}
`;
    const generate = vi.fn<AgenticFixGenerate>(async (prompt) => {
      if (generate.mock.calls.length === 1) {
        return JSON.stringify({
          writes: [{ filePath: "src/components/job-board.tsx", content: barrel }],
        });
      }
      expect(prompt).toMatch(/at least one new module/);
      return JSON.stringify({
        writes: [
          { filePath: "src/components/job-board.tsx", content: barrel },
          { filePath: "src/components/job-board/board.tsx", content: board },
          { filePath: "src/components/job-board/heading.tsx", content: heading },
        ],
      });
    });

    const result = await agenticFixWithRetry(
      { finding, content: source, existingServerAction: null, existingEnvExample: null },
      { generate }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(result.writes.length).toBeGreaterThanOrEqual(2);
    expect(result.writes.some((write) => write.filePath.endsWith("job-board/heading.tsx"))).toBe(true);
  }, 90_000);
});
