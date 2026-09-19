import Link from "next/link";

const SIGN_IN_LINK_CLASS =
  "inline-flex items-center justify-center bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-zinc-800 hover:text-white";

export default function LandingHeaderSignIn() {
  return (
    <Link href="/login" className={SIGN_IN_LINK_CLASS}>
      Sign In
    </Link>
  );
}
