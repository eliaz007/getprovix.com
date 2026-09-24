"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import {
  loadProfileAccountKind,
  persistAccountRole,
  persistEmployerAccount,
  resolvePostAuthDestination,
  signupMetadataForKind,
} from "@/lib/account-role";
import { getStandardEmailValidationMessage } from "@/lib/validate-email";
import { createClient } from "@/utils/supabase/server";

function authFailure(error?: unknown, err?: unknown): { error: string } {
  console.error(
    "FULL SUPABASE ERROR:",
    JSON.stringify(error || err, null, 2)
  );

  const message =
    (error as { message?: string } | null | undefined)?.message ||
    (err as { message?: string } | null | undefined)?.message;

  return {
    error: message || String(error ?? err ?? "Unknown authentication error"),
  };
}

export async function signInWithEmail(email: string, password: string) {
  let authError: { error: string } | undefined;

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      authError = authFailure(error);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const role = user ? await loadProfileAccountKind(supabase, user.id) : null;
      revalidatePath("/", "layout");
      redirect(resolvePostAuthDestination({ role }));
    }
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    authError = authFailure(undefined, err);
  }

  if (authError) {
    return authError;
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUpWithEmail(
  email: string,
  password: string,
  rawData: {
    role: "candidate" | "business";
    first_name: string;
    last_name: string;
  }
) {
  const emailError = getStandardEmailValidationMessage(email);
  if (emailError) {
    return { error: emailError };
  }

  let authError: { error: string } | undefined;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: signupMetadataForKind(rawData.role, {
          first_name: rawData.first_name,
          last_name: rawData.last_name,
        }),
      },
    });

    if (error) {
      authError = authFailure(error);
    } else if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        authError = authFailure(signInError);
      }
    }

    if (!authError) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && rawData.role === "business") {
        await persistEmployerAccount(
          supabase,
          user.id,
          user.email ?? email
        );
      } else if (user && rawData.role === "candidate") {
        await persistAccountRole(
          supabase,
          user.id,
          "candidate",
          user.email ?? email
        );
      }
    }
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    authError = authFailure(undefined, err);
  }

  if (authError) {
    return authError;
  }

  revalidatePath("/", "layout");
  redirect(
    resolvePostAuthDestination({
      role: rawData.role === "business" ? "employer" : "candidate",
    })
  );
}
