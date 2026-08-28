import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const HARD_SHADOW = "shadow-[4px_4px_0px_#000]";

const VARIANT_CLASSES = {
  primary:
    "bg-white text-zinc-950 border-zinc-950 hover:bg-zinc-100",
  secondary:
    "bg-indigo-600 text-white border-black hover:bg-indigo-500",
  ghost:
    "bg-[#111111] text-white border-zinc-600 hover:bg-zinc-900",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export default function Button({
  variant = "secondary",
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold cursor-pointer",
        "transition-transform duration-100",
        HARD_SHADOW,
        "active:scale-95 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_#000]",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
