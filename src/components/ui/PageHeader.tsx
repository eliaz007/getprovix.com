import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  className?: string;
};

export default function PageHeader({
  title,
  description,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-8", className)}>
      <h1 className="text-3xl font-extrabold tracking-tight text-textMain">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm text-textMuted">{description}</p>
      ) : null}
    </header>
  );
}
