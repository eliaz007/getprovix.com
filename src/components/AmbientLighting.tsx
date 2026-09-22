import type { ReactNode } from "react";

export default function AmbientLighting({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#0B0B0D] text-white">
      <div className="pointer-events-none absolute top-[-18%] left-1/2 -z-10 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-violet-600/5 blur-[140px]" />
      <div className="pointer-events-none absolute top-[28%] -left-24 -z-10 h-[380px] w-[380px] rounded-full bg-indigo-500/5 blur-[130px]" />
      <div className="pointer-events-none absolute top-[42%] -right-28 -z-10 h-[420px] w-[420px] rounded-full bg-violet-600/5 blur-[150px]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
