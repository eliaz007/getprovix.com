import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createJwtClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/admin-access";
import { resolveAccountRole } from "@/lib/account-role";
import { isEmployerRole } from "@/lib/dashboard-account";
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

function emptyEducationResponse() {
  return NextResponse.json(EMPTY_EDUCATION, {
    headers: { "Cache-Control": "no-store" },
  });
}

function cookiesFromRequest(request: Request): { name: string; value: string }[] {
  const header = request.headers.get("cookie") ?? "";
  if (!header.trim()) {
    return [];
  }

  return header.split(";").flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) {
      return [];
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      return [];
    }
    return [
      {
        name: trimmed.slice(0, eq).trim(),
        value: trimmed.slice(eq + 1).trim(),
      },
    ];
  });
}

function createRouteHandlerClient(request: Request): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookiesFromRequest(request);
        },
        setAll() {
          // Read-only in this route — session refresh is handled by middleware.
        },
      },
    }
  );
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1] ?? null;
}

async function readEmployerFromRequest(
  request: Request
): Promise<{ user: User; supabase: SupabaseClient } | null> {
  const cookieClient = createRouteHandlerClient(request);
  const {
    data: { user: cookieUser },
  } = await cookieClient.auth.getUser();

  let user = cookieUser;
  let supabase = cookieClient;

  if (!user) {
    const accessToken = readBearerToken(request);
    if (accessToken) {
      const tokenClient = createJwtClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );
      const {
        data: { user: tokenUser },
        error,
      } = await tokenClient.auth.getUser(accessToken);
      if (tokenUser && !error) {
        user = tokenUser;
        supabase = tokenClient;
      }
    }
  }

  if (!user) {
    return null;
  }

  const viewerRow = await fetchProfileForCandidateId(
    supabase,
    user.id,
    "role, is_verified"
  );
  const viewerRole = resolveAccountRole(
    typeof viewerRow?.role === "string" ? viewerRow.role : null,
    user
  );

  if (!isEmployerRole(viewerRole)) {
    return null;
  }

  return { user, supabase };
}

async function loadProfileRow(
  supabase: SupabaseClient,
  candidateRef: string
): Promise<Record<string, unknown> | null> {
  return fetchProfileForCandidateId(supabase, candidateRef, "*");
}

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
  if (!profileId || !isProfileUuid(profileId)) {
    return emptyEducationResponse();
  }

  const access = await readEmployerFromRequest(request);
  if (!access) {
    return emptyEducationResponse();
  }

  const userRow = await loadProfileRow(access.supabase, profileId);

  let row = userRow;
  const admin = createServiceRoleClient();
  let adminRow: Record<string, unknown> | null = null;
  if (admin) {
    adminRow = await loadProfileRow(admin, profileId);
  }

  if (!userRow && !adminRow) {
    return emptyEducationResponse();
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
      return emptyEducationResponse();
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
