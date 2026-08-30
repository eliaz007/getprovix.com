import type { SupabaseClient } from "@supabase/supabase-js";

type VerifiedProfileRow = {
  id?: string | null;
  user_id?: string | null;
  is_verified?: boolean | null;
};

function rowIsVerified(row: VerifiedProfileRow | null | undefined): boolean {
  return row?.is_verified === true;
}

async function selectVerifiedRows(
  admin: SupabaseClient,
  userId: string
): Promise<VerifiedProfileRow[]> {
  const [byId, byUserId] = await Promise.all([
    admin
      .from("profiles")
      .select("id, user_id, is_verified")
      .eq("id", userId),
    admin
      .from("profiles")
      .select("id, user_id, is_verified")
      .eq("user_id", userId),
  ]);

  const rows = new Map<string, VerifiedProfileRow>();
  for (const row of [...(byId.data ?? []), ...(byUserId.data ?? [])]) {
    const key = typeof row.id === "string" ? row.id : JSON.stringify(row);
    rows.set(key, row as VerifiedProfileRow);
  }
  return [...rows.values()];
}

async function updateIsVerifiedByUserId(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, string | boolean | null>
): Promise<VerifiedProfileRow[]> {
  const byId = await admin
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id, user_id, is_verified");

  const byUserId = await admin
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("id, user_id, is_verified");

  if (byId.error) {
    console.error("[employer-verify] is_verified update by id failed:", byId.error);
  }
  if (byUserId.error) {
    console.error(
      "[employer-verify] is_verified update by user_id failed:",
      byUserId.error
    );
  }

  return [...(byId.data ?? []), ...(byUserId.data ?? [])] as VerifiedProfileRow[];
}

export async function persistEmployerVerifiedFlag(
  admin: SupabaseClient,
  userId: string,
  email: string
): Promise<{ ok: boolean; profileId: string | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const rpc = await admin.rpc("mark_employer_email_verified", {
    p_user_id: userId,
    p_email: normalizedEmail,
  });

  if (!rpc.error) {
    const rpcRows = (Array.isArray(rpc.data) ? rpc.data : rpc.data ? [rpc.data] : []) as VerifiedProfileRow[];
    if (rpcRows.some(rowIsVerified)) {
      const verified = rpcRows.find(rowIsVerified);
      return { ok: true, profileId: verified?.id ?? userId };
    }
  } else {
    console.warn("[employer-verify] mark_employer_email_verified rpc:", rpc.error.message);
  }

  const fullPatch = {
    is_verified: true,
    email_verified_at: nowIso,
    contact_email: normalizedEmail || null,
    email: normalizedEmail || null,
  };

  let updated = await updateIsVerifiedByUserId(admin, userId, fullPatch);
  if (!updated.some(rowIsVerified)) {
    updated = await updateIsVerifiedByUserId(admin, userId, { is_verified: true });
  }

  const confirmed = (await selectVerifiedRows(admin, userId)).find(rowIsVerified);
  if (confirmed) {
    return { ok: true, profileId: confirmed.id ?? userId };
  }

  console.error(
    "[employer-verify] is_verified did not persist for user",
    userId,
    updated
  );
  return { ok: false, profileId: null };
}

export async function employerIsVerifiedInDatabase(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const rows = await selectVerifiedRows(admin, userId);
  return rows.some(rowIsVerified);
}
