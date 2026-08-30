import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireApiUser } from "@/lib/api-auth";
import { resolveAccountRole } from "@/lib/account-role";
import { isEmployerRole } from "@/lib/dashboard-account";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import {
  educationFromProfileRow,
  hasTalentEducation,
} from "@/lib/talent-pool-profiles";
import {
  employerHasApplicantForProfile,
  fetchProfileForCandidateId,
  isProfileUuid,
  resolvedProfileId,
} from "@/lib/resolve-candidate-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_EDUCATION = {
  university: "",
  major: "",
  gpa: "",
  graduationYear: "",
};

async function loadProfileRow(
  supabase: SupabaseClient,
  candidateRef: string
): Promise<Record<string, unknown> | null> {
  return fetchProfileForCandidateId(supabase, candidateRef, "*");
}

export async function GET(request: Request) {
  const access = await requireApiUser(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 }
    );
  }

  if (!isProfileUuid(profileId)) {
    return NextResponse.json(
      {
        ...EMPTY_EDUCATION,
        error: "profileId must be a profile or auth user UUID.",
      },
      { status: 400 }
    );
  }

  const viewerRow =
    (await fetchProfileForCandidateId(access.supabase, access.user.id, "role")) ??
    (await access.supabase
      .from("profiles")
      .select("role")
      .eq("id", access.user.id)
      .maybeSingle()).data;

  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    access.user
  );

  if (!isEmployerRole(viewerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userRow = await loadProfileRow(access.supabase, profileId);

  let row = userRow;
  const admin = createServiceRoleClient();
  let adminRow: Record<string, unknown> | null = null;
  if (admin) {
    adminRow = await loadProfileRow(admin, profileId);
  }

  if (adminRow) {
    const publiclyListed = profileRowIsPublicToEmployers(adminRow);
    const isApplicant = await employerHasApplicantForProfile(
      admin ?? access.supabase,
      access.user.id,
      adminRow,
      [profileId]
    );

    if (publiclyListed || userRow || isApplicant) {
      row = adminRow;
    } else if (!userRow) {
      console.info("[talent-pool/education] hidden profile", {
        profileId,
        resolvedId: resolvedProfileId(adminRow, profileId),
      });
      return NextResponse.json(EMPTY_EDUCATION, {
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const education = educationFromProfileRow(row);

  console.info("[talent-pool/education]", {
    profileId,
    resolvedId: resolvedProfileId(row, profileId),
    foundRow: Boolean(row),
    usedServiceRole: Boolean(admin),
    educationColumns: row
      ? Object.keys(row).filter((key) =>
          /univ|school|college|major|degree|gpa|grad/i.test(key)
        )
      : [],
    hasEducation: hasTalentEducation(education),
  });

  return NextResponse.json(education, {
    headers: { "Cache-Control": "no-store" },
  });
}
