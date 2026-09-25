import type { ReactNode } from "react";

export default function AmbientLighting({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#08090d] text-white md:overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 md:hidden"
        style={{
          background:
            "radial-gradient(380px 380px at 12% 32%, rgba(6, 182, 212, 0.14), transparent 68%), radial-gradient(420px 420px at 88% 46%, rgba(124, 58, 237, 0.16), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[28%] -left-24 hidden h-[380px] w-[380px] rounded-full bg-cyan-500/5 blur-[130px] md:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[42%] -right-28 hidden h-[420px] w-[420px] rounded-full bg-violet-600/5 blur-[150px] md:block"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
