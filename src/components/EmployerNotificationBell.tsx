"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { createClient } from "@/utils/supabase/client";

export type EmployerNotification = {
  id: string;
  message: string;
  job_id: string | null;
  is_read: boolean;
  created_at: string;
};

type EmployerNotificationBellProps = {
  userId: string | null;
  onOpenJobApplicants: (jobId: string) => void;
};

export default function EmployerNotificationBell({
  userId,
  onOpenJobApplicants,
}: EmployerNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<EmployerNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((row) => !row.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("notifications")
      .select("id, message, job_id, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to fetch notifications:", error);
    } else {
      setNotifications(data ?? []);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleNotificationClick = async (notification: EmployerNotification) => {
    if (!userId) {
      return;
    }

    setNotifications((current) =>
      current.map((row) =>
        row.id === notification.id ? { ...row, is_read: true } : row
      )
    );
    setOpen(false);

    if (!notification.is_read) {
      const supabase = createClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    if (notification.job_id) {
      onOpenJobApplicants(notification.job_id);
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        className="relative p-2 rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-[10px] font-bold text-white flex items-center justify-center border border-[#0A0A0A]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-slate-800 bg-[#111111] shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-800">
            <p className="text-sm font-bold text-white">Notifications</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Candidate interest on your job listings
            </p>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No notifications yet
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      notification.is_read
                        ? "hover:bg-slate-900/40"
                        : "bg-indigo-500/5 hover:bg-indigo-500/10"
                    }`}
                  >
                    <p
                      className={`text-sm leading-snug ${
                        notification.is_read ? "text-slate-300" : "text-white"
                      }`}
                    >
                      {notification.message}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatRelativeTime(notification.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
