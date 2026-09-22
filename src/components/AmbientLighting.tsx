import type { ReactNode } from "react";

export default function AmbientLighting({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#0B0B0D] text-white">
      <div className="pointer-events-none absolute top-[-8%] left-1/2 -z-10 h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.16)_0%,rgba(245,158,11,0.05)_45%,transparent_72%)] blur-[1px]" />
      <div className="pointer-events-none absolute top-[32%] -left-28 -z-10 h-[360px] w-[360px] rounded-full bg-amber-500/[0.05] blur-[130px]" />
      <div className="pointer-events-none absolute top-[48%] -right-24 -z-10 h-[400px] w-[400px] rounded-full bg-amber-500/[0.04] blur-[150px]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
