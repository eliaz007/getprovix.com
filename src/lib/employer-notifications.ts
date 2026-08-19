import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseSchemaError } from "@/lib/supabase-schema-errors";

export type EmployerNotificationRow = {
  id: string;
  message: string;
  job_id: string | null;
  is_read: boolean;
  created_at: string;
};

export async function fetchEmployerNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<EmployerNotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, message, job_id, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.warn("Failed to fetch notifications:", error.message);
    }
    return [];
  }

  return (data ?? []) as EmployerNotificationRow[];
}

export async function markEmployerNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error && !isSupabaseSchemaError(error)) {
    console.warn("Failed to mark notification as read:", error.message);
    return false;
  }

  return !error;
}

export async function createEmployerNotification(
  supabase: SupabaseClient,
  input: {
    userId: string;
    jobId: string;
    message: string;
  }
): Promise<boolean> {
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    job_id: input.jobId,
    message: input.message,
    is_read: false,
  });

  if (error) {
    if (!isSupabaseSchemaError(error)) {
      console.warn("Failed to create employer notification:", error.message);
    }
    return false;
  }

  return true;
}
