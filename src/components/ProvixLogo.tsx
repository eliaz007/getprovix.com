export function ProvixLogo({
  className = "h-8 w-8",
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/provix-mark.jpg"
          alt=""
          aria-hidden="true"
          className={`rounded-[22%] object-cover ${className}`}
        />
      </div>

      {showText && (
        <span className="text-xl font-bold tracking-wider text-textMain">PROVIX</span>
      )}
    </div>
  );
}
