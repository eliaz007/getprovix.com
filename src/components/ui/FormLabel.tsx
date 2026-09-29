import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FormLabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export default function FormLabel({
  className,
  children,
  ...props
}: FormLabelProps) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-textMuted",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
