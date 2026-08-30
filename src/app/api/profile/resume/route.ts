import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  extractResumeTextFromFile,
  getResumeFileError,
} from "@/lib/parse-resume";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export const runtime = "nodejs";

type ResumeMeta = {
  filename: string | null;
  uploadedAt: string | null;
  hasResume: boolean;
  excerptLength: number;
};

function isMissingResumeColumn(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    isSupabaseSchemaError(error) ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (error.message?.toLowerCase().includes("resume_text") ?? false) ||
    (error.message?.toLowerCase().includes("resume_filename") ?? false)
  );
}

function missingColumnResponse() {
  return NextResponse.json(
    {
      error:
        "Resume storage is not enabled yet. Apply Supabase migration 0044_add_resume_text.sql.",
    },
    { status: 500 }
  );
}

export async function GET() {
  const access = await requireApiUser();
  if (access instanceof NextResponse) {
    return access;
  }

  const { data, error } = await access.supabase
    .from("profiles")
    .select("resume_filename, resume_uploaded_at, resume_text")
    .eq("id", access.user.id)
    .maybeSingle();

  if (error && isMissingResumeColumn(error)) {
    return NextResponse.json({
      filename: null,
      uploadedAt: null,
      hasResume: false,
      excerptLength: 0,
    } satisfies ResumeMeta);
  }

  if (error) {
    console.error("[profile/resume] GET failed:", error);
    return NextResponse.json(
      { error: "Could not load saved resume." },
      { status: 500 }
    );
  }

  const filename = data?.resume_filename?.trim() || null;
  const text = data?.resume_text?.trim() || "";

  return NextResponse.json({
    filename,
    uploadedAt: data?.resume_uploaded_at ?? null,
    hasResume: Boolean(text || filename),
    excerptLength: text.length,
  } satisfies ResumeMeta);
}

export async function POST(request: Request) {
  const access = await requireApiUser();
  if (access instanceof NextResponse) {
    return access;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Choose a PDF or text resume to upload." },
      { status: 400 }
    );
  }

  const fileError = getResumeFileError(file);
  if (fileError) {
    return NextResponse.json({ error: fileError }, { status: 400 });
  }

  let resumeText: string;

  try {
    resumeText = await extractResumeTextFromFile(file);
  } catch (error) {
    console.error("[profile/resume] parse failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not parse that resume. Try a PDF or .txt file.",
      },
      { status: 422 }
    );
  }

  const uploadedAt = new Date().toISOString();
  const payload = {
    resume_text: resumeText,
    resume_filename: file.name.slice(0, 240),
    resume_uploaded_at: uploadedAt,
  };

  const { error } = await access.supabase
    .from("profiles")
    .update(payload)
    .eq("id", access.user.id);

  if (error && isMissingResumeColumn(error)) {
    return missingColumnResponse();
  }

  if (error) {
    console.error("[profile/resume] save failed:", error);
    return NextResponse.json(
      { error: "Could not save the parsed resume to your profile." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    filename: payload.resume_filename,
    uploadedAt,
    hasResume: true,
    excerptLength: resumeText.length,
  } satisfies ResumeMeta);
}

export async function DELETE() {
  const access = await requireApiUser();
  if (access instanceof NextResponse) {
    return access;
  }

  const { error } = await access.supabase
    .from("profiles")
    .update({
      resume_text: null,
      resume_filename: null,
      resume_uploaded_at: null,
    })
    .eq("id", access.user.id);

  if (error && isMissingResumeColumn(error)) {
    return missingColumnResponse();
  }

  if (error) {
    console.error("[profile/resume] delete failed:", error);
    return NextResponse.json(
      { error: "Could not remove the saved resume." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    filename: null,
    uploadedAt: null,
    hasResume: false,
    excerptLength: 0,
  } satisfies ResumeMeta);
}
