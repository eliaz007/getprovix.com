import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section";
  interactive?: boolean;
};

export default function Card({
  as: Comp = "div",
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Comp
      className={cn(
        "card-edge rounded-md border border-zinc-700 bg-[#111111] text-zinc-50 shadow-[4px_4px_0px_#000]",
        interactive && "card-lift",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
