"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { RESUME_ACCEPT } from "@/lib/resume-file";

export type StoredResumeMeta = {
  filename: string | null;
  uploadedAt: string | null;
  hasResume: boolean;
  excerptLength: number;
};

type ResumeFileUploadProps = {
  persistToProfile?: boolean;
  localFallbackOnAuthError?: boolean;
  initialFilename?: string | null;
  helperText?: string;
  disabled?: boolean;
  onLocalFileChange?: (file: File | null) => void;
  onPersisted?: (meta: StoredResumeMeta) => void;
};

export default function ResumeFileUpload({
  persistToProfile = false,
  localFallbackOnAuthError = false,
  initialFilename = null,
  helperText,
  disabled = false,
  onLocalFileChange,
  onPersisted,
}: ResumeFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(initialFilename);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    setFilename(initialFilename);
  }, [initialFilename]);

  const resetInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const persistFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/profile/resume", {
      method: "POST",
      body: formData,
    });

    if (response.status === 401) {
      if (localFallbackOnAuthError) {
        setFilename(file.name);
        onLocalFileChange?.(file);
        return;
      }
      throw new Error("Sign in to upload a resume.");
    }

    const data = (await response.json()) as StoredResumeMeta & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Could not upload resume.");
    }

    setFilename(data.filename);
    onPersisted?.(data);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled || uploading) {
      return;
    }

    setError(null);

    if (!persistToProfile) {
      setFilename(file.name);
      onLocalFileChange?.(file);
      return;
    }

    setUploading(true);
    try {
      await persistFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload resume.");
    } finally {
      setUploading(false);
      resetInput();
    }
  };

  const handleClear = async () => {
    if (disabled || uploading) {
      return;
    }

    setError(null);

    if (!persistToProfile) {
      setFilename(null);
      onLocalFileChange?.(null);
      resetInput();
      return;
    }

    setUploading(true);
    try {
      const response = await fetch("/api/profile/resume", { method: "DELETE" });
      if (response.status === 401) {
        if (localFallbackOnAuthError) {
          setFilename(null);
          onLocalFileChange?.(null);
          return;
        }
        throw new Error("Sign in to update your resume.");
      }
      const data = (await response.json()) as StoredResumeMeta & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove resume.");
      }
      setFilename(null);
      onPersisted?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove resume.");
    } finally {
      setUploading(false);
      resetInput();
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
        }}
      />

      {filename ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brandGlow text-brand">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-4 w-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-textMain">{filename}</p>
              <p className="text-[11px] text-textMuted">
                {uploading ? "Parsing resume…" : "Ready for AI audits"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={disabled || uploading}
            aria-label="Remove resume"
            className="rounded-lg p-2 text-textMuted hover:bg-panel hover:text-textMain transition-colors duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void handleFile(event.dataTransfer.files?.[0]);
          }}
          className={`w-full rounded-xl border border-dashed px-4 py-6 text-center transition-colors duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
 dragActive
 ? "border-brand bg-brandGlow"
 : "border-border bg-background hover:border-brand/50 hover:bg-brandHover/5"
 }`}
        >
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-textMuted">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="block text-sm font-medium text-textMain">
            {uploading ? "Parsing resume…" : "Upload resume"}
          </span>
          <span className="mt-1 block text-[11px] text-textMuted">
            PDF or text file, up to 5 MB
          </span>
        </button>
      )}

      {helperText && !error && (
        <p className="mt-2 text-[11px] text-textMuted">{helperText}</p>
      )}
      {error && <p className="mt-2 text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
