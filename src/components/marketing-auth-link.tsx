import Link from "next/link";

export const linkClassName =
  "rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-semibold text-textMain transition-colors duration-200 hover:bg-white/5";

export default function MarketingAuthLink({ className = linkClassName }: { className?: string }) {
  return (
    <Link href="/onboarding" prefetch={false} className={className}>
      Sign in
    </Link>
  );
}
