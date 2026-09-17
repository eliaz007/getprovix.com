import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/admin-access";
import { requireVerifiedEmployer } from "@/lib/api-auth";
import { profileRowIsPublicToEmployers } from "@/lib/opportunities-metrics";
import {
  educationFromProfileRow,
  fetchCandidateEducationForEmployer,
  hasTalentEducation,
  hydrateRowsWithEducation,
  mergeTalentEducation,
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
  isSelfTaught: false,
};

async function loadProfileRow(
  supabase: SupabaseClient,
  candidateRef: string
): Promise<Record<string, unknown> | null> {
  return fetchProfileForCandidateId(supabase, candidateRef, "*");
}

export async function GET(request: Request) {
  const access = await requireVerifiedEmployer(request);
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

  if (row && userRow && row !== userRow) {
    row = { ...userRow, ...row };
    for (const [key, value] of Object.entries(userRow)) {
      const current = row[key];
      const currentEmpty =
        current == null || (typeof current === "string" && !current.trim());
      const incomingEmpty =
        value == null || (typeof value === "string" && !value.trim());
      if (currentEmpty && !incomingEmpty) {
        row[key] = value;
      }
    }
  }

  if (row) {
    const reader = admin ?? access.supabase;
    const [hydrated] = await hydrateRowsWithEducation(reader, [row]);
    row = hydrated;
  }

  const dedicatedEducation = await fetchCandidateEducationForEmployer(
    admin ?? access.supabase,
    profileId
  );
  const education = mergeTalentEducation(
    educationFromProfileRow(row),
    dedicatedEducation ?? EMPTY_EDUCATION
  );

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
