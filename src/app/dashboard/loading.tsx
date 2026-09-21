/**
 * Intentionally empty: a DashboardSkeleton here is swapped in by Next.js
 * Suspense on every /dashboard/* segment transition and reads as a
 * full-screen grid flash during sidebar / AI-tool navigation. The shell
 * already covers initial auth bootstrap via DashboardContentGate.
 */
export default function DashboardLoading() {
  return null;
}
