"use client";

import React from "react";

interface ToastProps {
  message: string | null;
}

export default function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[#18181b] border border-slate-700 text-slate-100 text-xs font-medium px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-bottom-3">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span>{message}</span>
    </div>
  );
}