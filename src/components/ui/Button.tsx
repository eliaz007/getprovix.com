import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** @deprecated Prefer border border-border — hard shadows are retired in the 95/5 system. */
export const HARD_SHADOW = "border border-border";

export const BUTTON_MOTION =
  "transition-all duration-200 ease-out";

const VARIANT_CLASSES = {
  primary:
    "bg-[#F4F4F6] text-[#0B0B0D] border-transparent hover:bg-white font-semibold shadow-sm",
  secondary:
    "bg-[#131316]/85 text-textMain border-white/[0.08] hover:bg-[#1A1A1E] backdrop-blur-xl",
  ghost:
    "bg-transparent text-zinc-300 border-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-100",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export default function Button({
  variant = "primary",
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold tracking-tight cursor-pointer",
        BUTTON_MOTION,
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
