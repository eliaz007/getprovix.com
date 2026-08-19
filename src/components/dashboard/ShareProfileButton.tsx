"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { buildPublicProfileUrl, buildPublicProfileUrlFromOrigin } from "@/lib/profile-url";

type ShareProfileButtonProps = {
  profileSlug: string;
};

export default function ShareProfileButton({
  profileSlug,
}: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleShare = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const shareUrl = origin
      ? buildPublicProfileUrlFromOrigin(profileSlug, origin)
      : buildPublicProfileUrl(profileSlug);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy profile link:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all cursor-pointer shrink-0 ${
        copied
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" aria-hidden />
          Copied! ✓
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4" aria-hidden />
          Share Profile
        </>
      )}
    </button>
  );
}
