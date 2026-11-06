import type { ReactNode } from "react";

const CORNERS = ["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"] as const;

export default function RegistrationMarks(): ReactNode {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {CORNERS.map((corner) => (
        <span
          key={corner}
          className={`absolute ${corner} -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] leading-none text-[#71717a]`}
        >
          +
        </span>
      ))}
    </div>
  );
}
