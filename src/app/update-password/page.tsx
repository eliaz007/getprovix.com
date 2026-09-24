"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;

    const ensureRecoverySession = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");

      if (code) {
        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("code", code);
        callbackUrl.searchParams.set(
          "next",
          searchParams.get("next") ?? "/update-password"
        );
        window.location.replace(callbackUrl.toString());
        return;
      }

      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");

      if (type === "recovery" && accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError && active) {
          setError(sessionError.message);
        }

        window.history.replaceState({}, "", window.location.pathname);
      }

      const waitForSession = async (attempts = 4) => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session) {
            return session;
          }

          if (attempt < attempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 250));
          }
        }

        return null;
      };

      const session = await waitForSession();

      if (!active) {
        return;
      }

      setHasSession(Boolean(session));
      setCheckingSession(false);
    };

    void ensureRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(Boolean(session));
        setCheckingSession(false);
        setError(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!hasSession) {
      setError(
        "No active password reset session. Request a new reset link from the sign-in page."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    window.location.href = "/?passwordUpdated=1";
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-textMuted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-textMuted hover:text-textMain transition-colors duration-200 ease-out mb-4"
        >
          ← Back to Home
        </Link>
        <Card interactive={false} className="p-8">
          <div className="flex justify-center mb-6">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <ProvixLogo />
            </Link>
          </div>

          <h1 className="text-2xl font-extrabold text-textMain tracking-tight text-center">
            Update Password
          </h1>
          <p className="text-sm text-textMuted text-center mb-8">
            Choose a new password for your Provix account.
          </p>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-textMuted">
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={!hasSession || loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg pl-4 pr-11 py-2 text-textMain placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-textMuted hover:text-textMuted transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-textMuted"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="••••••••"
                required
                minLength={6}
                disabled={!hasSession || loading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-background border border-border rounded-lg px-4 py-2 text-textMain placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>

            <Button
              type="submit"
              disabled={!hasSession || loading}
              className="w-full mt-2"
            >
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>

          <p className="mt-6 pt-6 border-t border-border text-center text-sm text-textMuted">
            <Link
              href="/login"
              className="text-brand hover:text-brand font-medium transition-colors"
            >
              ← Back to Sign In
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
