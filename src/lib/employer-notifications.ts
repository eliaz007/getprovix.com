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
  try {
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
  } catch (error) {
    console.error(
      "[employer-notifications] fetchEmployerNotifications failed:",
      error
    );
    return [];
  }
}

export async function markEmployerNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string
): Promise<boolean> {
  try {
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
  } catch (error) {
    console.error(
      "[employer-notifications] markEmployerNotificationRead failed:",
      error
    );
    return false;
  }
}

export async function createEmployerNotification(
  supabase: SupabaseClient,
  notification: {
    userId: string;
    jobId: string;
    title?: string;
    message: string;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: notification.userId,
      job_id: notification.jobId,
      title: notification.title ?? "New Candidate Interest",
      message: notification.message,
      is_read: false,
    });

    if (error) {
      if (!isSupabaseSchemaError(error)) {
        console.warn("Failed to create employer notification:", error.message);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[employer-notifications] createEmployerNotification failed:",
      error
    );
    return false;
  }
}
