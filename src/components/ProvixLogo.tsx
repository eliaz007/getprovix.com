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
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          <rect
            width="36"
            height="36"
            rx="8"
            fill="#18181B"
            stroke="#27272A"
            strokeWidth="1"
          />
          <path
            d="M12 25V11H19.5C22.5 11 24.5 13 24.5 16C24.5 19 22.5 21 19.5 21H12"
            stroke="#6366F1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18.5" cy="16" r="1.5" fill="#38BDF8" />
        </svg>
      </div>

      {showText && (
        <span className="text-xl font-bold tracking-wider text-textMain">PROVIX</span>
      )}
    </div>
  );
}
