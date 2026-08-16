type ProvixLogoProps = {
  showText?: boolean;
  className?: string;
};

export function ProvixLogo({ showText = true, className = "" }: ProvixLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-[0_0_18px_rgba(99,102,241,0.25)]">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="provix-mark-gradient"
              x1="6"
              y1="4"
              x2="24"
              y2="28"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#6366F1" />
              <stop offset="1" stopColor="#06B6D4" />
            </linearGradient>
          </defs>

          <path
            d="M9 6.5H16.5C20.0899 6.5 23 9.41015 23 13C23 16.5899 20.0899 19.5 16.5 19.5H13V25.5H9V6.5Z"
            fill="url(#provix-mark-gradient)"
          />
          <path
            d="M13 10H16C17.6569 10 19 11.3431 19 13C19 14.6569 17.6569 16 16 16H13V10Z"
            fill="#09090B"
          />

          <circle cx="24.5" cy="7.5" r="2.25" fill="#22D3EE" />
          <path
            d="M26.8 3.6L27.35 5.05L28.8 5.6L27.35 6.15L26.8 7.6L26.25 6.15L24.8 5.6L26.25 5.05L26.8 3.6Z"
            fill="#67E8F9"
          />
        </svg>
      </div>

      {showText ? (
        <span className="font-bold tracking-wider text-white uppercase">PROVIX</span>
      ) : null}
    </div>
  );
}
