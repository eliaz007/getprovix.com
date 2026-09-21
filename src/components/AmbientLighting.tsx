import type { ReactNode } from "react";

export default function AmbientLighting({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#070709] text-white overflow-hidden isolate">
      {/* Top Center Electric Bloom */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[650px] sm:w-[900px] h-[450px] bg-gradient-to-tr from-blue-600/30 via-indigo-500/25 to-violet-500/20 blur-[150px] rounded-full pointer-events-none -z-10" />
      {/* Left Cyan Accent */}
      <div className="absolute top-1/3 -left-32 w-[450px] h-[450px] bg-cyan-500/15 blur-[140px] rounded-full pointer-events-none -z-10" />
      {/* Right Deep Purple Accent */}
      <div className="absolute top-1/2 -right-32 w-[500px] h-[500px] bg-purple-600/15 blur-[160px] rounded-full pointer-events-none -z-10" />
      {/* Bottom Grounding Glow */}
      <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-blue-600/10 blur-[130px] rounded-full pointer-events-none -z-10" />
      {/* Page Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
