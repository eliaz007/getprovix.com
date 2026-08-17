"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { ProvixLogo } from "@/components/ProvixLogo";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

type AuthMode = "sign-in" | "sign-up";
type SignUpType = "candidate" | "business";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [signUpType, setSignUpType] = useState<SignUpType>("candidate");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Session check for the "already signed in" case — someone landing on
  // /login (e.g. via a bookmark or back button) while still authenticated
  // should see the "Welcome back" screen instead of the sign-in form.
  const [checkingSession, setCheckingSession] = useState(true);
  const [authedUser, setAuthedUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthedUser(session?.user ?? null);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthedUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const [signOutLoading, setSignOutLoading] = useState(false);

  const handleSignOut = async () => {
    setSignOutLoading(true);

    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.error("Sign out failed:", signOutError);
    }

    window.location.href = "/login";
  };

  const goToDashboard = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Session expired. Please sign in again.");
        setAuthedUser(null);
        return;
      }
    }

    window.location.href = "/admin/requests";
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setSignUpType("candidate");
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      window.location.href = "/admin/requests";
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: signUpType,
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setLoading(false);
      setMessage("Check your email to confirm your account.");
      setMode("sign-in");
      return;
    }

    window.location.href = "/admin/requests";
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  // --- ALREADY SIGNED IN: "Welcome back" screen ---
  if (authedUser) {
    const initial = authedUser.email?.charAt(0).toUpperCase() ?? "?";

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xl mb-5">
            {initial}
          </div>

          <h1 className="text-xl font-semibold text-white tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-zinc-400 mt-1 mb-6">
            You&apos;re signed in as
          </p>

          <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 mb-8 truncate">
            {authedUser.email}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void goToDashboard()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 cursor-pointer"
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signOutLoading}
              className="w-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-medium text-sm px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {signOutLoading ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- SIGNED OUT: Sign In / Sign Up form ---
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-6">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <ProvixLogo />
            </Link>
          </div>
          {/* Header */}
          <h1 className="text-2xl font-semibold text-white tracking-tight text-center">
            Welcome to Provix
          </h1>
          <p className="text-sm text-zinc-400 text-center mb-8">
            {mode === "sign-in"
              ? "Sign in to access your account"
              : "Create an account to get started"}
          </p>

          {/* Sign In / Sign Up Toggle */}
          <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode("sign-in")}
              className={`py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                mode === "sign-in"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("sign-up")}
              className={`py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                mode === "sign-up"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Candidate / Business Sign Up Toggle */}
          {mode === "sign-up" && (
            <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 mb-6">
              <button
                type="button"
                onClick={() => setSignUpType("candidate")}
                className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  signUpType === "candidate"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Candidate Sign Up
              </button>
              <button
                type="button"
                onClick={() => setSignUpType("business")}
                className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  signUpType === "business"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Business Sign Up
              </button>
            </div>
          )}

          {/* Error / Success Banner */}
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-2.5">
              {message}
            </div>
          )}

          {/* Form */}
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {mode === "sign-up" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="firstName" className="text-sm font-medium text-zinc-300">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    name="firstName"
                    placeholder="Jordan"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="lastName" className="text-sm font-medium text-zinc-300">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    name="lastName"
                    placeholder="Lee"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                {mode === "sign-up" && signUpType === "business" ? "Work Email" : "Email"}
              </label>
              <input
                id="email"
                type="email"
                name="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-4 pr-11 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors mt-2 cursor-pointer"
            >
              {loading
                ? "Please wait..."
                : mode === "sign-in"
                ? "Sign In"
                : signUpType === "business"
                ? "Create Business Account"
                : "Create Account"}
            </button>

            {mode === "sign-up" && (
              <p className="text-xs text-zinc-400 text-center mt-3 leading-relaxed">
                By creating an account, you agree to our{" "}
                <a
                  href="/terms"
                  className="underline text-zinc-300 hover:text-white"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  className="underline text-zinc-300 hover:text-white"
                >
                  Privacy Policy
                </a>
                .
              </p>
            )}
          </form>

          {/* Footer Toggle Link */}
          <p className="mt-6 pt-6 border-t border-zinc-800 text-center text-sm text-zinc-400">
            {mode === "sign-in" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("sign-up")}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
                >
                  Sign up here
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("sign-in")}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
                >
                  Sign in here
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
