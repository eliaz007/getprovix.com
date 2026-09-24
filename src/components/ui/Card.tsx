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
        "card-edge rounded-md border border-border bg-panel text-textMain",
        interactive && "card-lift",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
