"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  fetchIncomingJobInterest,
  markJobInterestRead,
  subscribeIncomingJobInterest,
  type IncomingJobInterest,
} from "@/lib/job-interest";
import { createClient } from "@/utils/supabase/client";

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
  const [notifications, setNotifications] = useState<IncomingJobInterest[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((row) => !row.isRead).length;

  const fetchNotifications = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) {
        setNotifications([]);
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      const supabase = createClient();
      try {
        const rows = await fetchIncomingJobInterest(supabase, userId);
        setNotifications(rows);
      } catch (error) {
        console.error("Failed to fetch incoming job interest:", error);
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [userId]
  );

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
    if (!userId) {
      return;
    }

    const supabase = createClient();
    return subscribeIncomingJobInterest(supabase, userId, () => {
      void fetchNotifications({ silent: true });
    });
  }, [userId, fetchNotifications]);

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

  const handleNotificationClick = async (notification: IncomingJobInterest) => {
    if (!userId) {
      return;
    }

    setNotifications((current) =>
      current.map((row) =>
        row.id === notification.id ? { ...row, isRead: true } : row
      )
    );
    setOpen(false);

    if (!notification.isRead) {
      try {
        const supabase = createClient();
        await markJobInterestRead(supabase, userId, notification.jobId);
      } catch (error) {
        console.warn("Failed to mark job interest as read:", error);
      }
    }

    onOpenJobApplicants(notification.jobId);
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
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-[#111111]"
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-zinc-800 bg-[#111111] shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-zinc-800">
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
                      notification.isRead
                        ? "hover:bg-slate-900/40"
                        : "bg-indigo-500/5 hover:bg-indigo-500/10"
                    }`}
                  >
                    <p
                      className={`text-sm leading-snug ${
                        notification.isRead ? "text-slate-300" : "text-white"
                      }`}
                    >
                      {notification.message}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatRelativeTime(notification.createdAt)}
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
