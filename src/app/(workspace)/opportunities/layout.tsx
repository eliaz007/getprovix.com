import type { ReactNode } from "react";

/** Shell/sidebar live in `(workspace)/layout.tsx` so they stay mounted across tabs. */
export default function OpportunitiesSegmentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
