import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** @deprecated Prefer border border-border — hard shadows are retired in the 95/5 system. */
export const HARD_SHADOW = "border border-border";

export const BUTTON_MOTION =
  "transition-colors duration-200 ease-out";

const VARIANT_CLASSES = {
  primary:
    "bg-brand text-white border-transparent hover:bg-brandHover active:bg-brandHover focus-visible:ring-brand/50",
  secondary:
    "bg-panel text-textMain border-border hover:bg-surface focus-visible:ring-border",
  ghost:
    "bg-panel text-textMain border-border hover:bg-surface focus-visible:ring-border",
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
