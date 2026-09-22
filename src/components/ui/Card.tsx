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
        "card-edge rounded-xl border border-white/[0.08] bg-[#131316]/85 text-textMain shadow-2xl backdrop-blur-xl",
        interactive && "card-lift",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
