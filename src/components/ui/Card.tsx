import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section";
};

export default function Card({
  as: Comp = "div",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Comp
      className={cn(
        "card-edge rounded-md border border-zinc-700 bg-[#111111] shadow-[4px_4px_0px_#000]",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
