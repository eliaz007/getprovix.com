import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const HARD_SHADOW = "shadow-[4px_4px_0px_#000]";

export const BUTTON_MOTION =
  "transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ease-out";

const VARIANT_CLASSES = {
  primary:
    "bg-white text-zinc-950 border-zinc-950 hover:bg-zinc-50",
  secondary:
    "bg-indigo-600 text-white border-black hover:bg-indigo-500",
  ghost:
    "bg-[#111111] text-white border-zinc-500 hover:bg-zinc-800 hover:border-zinc-400",
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
        "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold tracking-tight cursor-pointer",
        BUTTON_MOTION,
        HARD_SHADOW,
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
