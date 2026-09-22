import type { ReactNode } from "react";

export default function AmbientLighting({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#0B0B0D] text-white">
      <div className="pointer-events-none absolute top-[-12%] left-1/2 -z-10 h-[520px] w-[780px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.14)_0%,rgba(245,158,11,0.04)_42%,transparent_70%)] blur-[2px]" />
      <div className="pointer-events-none absolute top-[32%] -left-28 -z-10 h-[360px] w-[360px] rounded-full bg-amber-500/[0.04] blur-[130px]" />
      <div className="pointer-events-none absolute top-[48%] -right-24 -z-10 h-[400px] w-[400px] rounded-full bg-amber-500/[0.035] blur-[150px]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
