"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

type RevealTag = "div" | "section" | "header" | "footer";

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: RevealTag;
  id?: string;
  "aria-labelledby"?: string;
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[Tag];

  if (reduce) {
    const Static = Tag;
    return (
      <Static className={className} {...rest}>
        {children}
      </Static>
    );
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -64px 0px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -48px 0px" }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.09, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Glass card with cursor-follow border spotlight + lift on hover. */
export function SpotlightCard({
  children,
  className = "",
  ...props
}: HTMLMotionProps<"article"> & { children: ReactNode }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, rgba(168,85,247,0.22), rgba(52,211,153,0.06) 32%, transparent 55%)`;
  const sheen = useMotionTemplate`radial-gradient(280px circle at ${mx}px ${my}px, rgba(255,255,255,0.08), transparent 50%)`;
  const rotateX = useSpring(0, { stiffness: 260, damping: 28 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 28 });
  const lift = useSpring(0, { stiffness: 280, damping: 26 });

  const onMove = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      mx.set(px);
      my.set(py);
      const nx = (px / rect.width) * 2 - 1;
      const ny = (py / rect.height) * 2 - 1;
      rotateY.set(nx * 3.5);
      rotateX.set(-ny * 3.5);
      lift.set(-4);
    },
    [mx, my, rotateX, rotateY, lift]
  );

  const onLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    lift.set(0);
  }, [rotateX, rotateY, lift]);

  return (
    <motion.article
      onMouseMove={reduce ? undefined : onMove}
      onMouseLeave={reduce ? undefined : onLeave}
      style={
        reduce
          ? undefined
          : {
              rotateX,
              rotateY,
              y: lift,
              transformPerspective: 900,
            }
      }
      transition={{ duration: 0.3, ease: EASE }}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-[border-color,box-shadow] duration-300 hover:border-white/20 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_24px_48px_-28px_rgba(168,85,247,0.35)] ${className}`}
      {...props}
    >
      {!reduce ? (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: spotlight }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: sheen }}
          />
        </>
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-500 ease-out group-hover:scale-x-100"
      />
      <div className="relative z-[1]">{children}</div>
    </motion.article>
  );
}

export function MotionButton({
  children,
  className,
  ...props
}: HTMLMotionProps<"button">) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileHover={reduce ? undefined : { scale: 1.02 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Interactive grid + mouse-following radial glow for the landing canvas. */
export function AmbientBackdrop(): ReactNode {
  const reduce = useReducedMotion();
  // Gate mouse/grid motion until after mount so SSR HTML matches the first client paint.
  const [isMounted, setIsMounted] = useState(false);
  // Stable defaults only — never read window during render (hydration mismatch).
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const gridShiftX = useMotionValue(0);
  const gridShiftY = useMotionValue(0);

  const glow = useMotionTemplate`radial-gradient(540px circle at ${mouseX}px ${mouseY}px, rgba(168,85,247,0.28), rgba(52,211,153,0.08) 28%, transparent 58%)`;
  const gridMask = useMotionTemplate`radial-gradient(420px circle at ${mouseX}px ${mouseY}px, black 0%, transparent 62%)`;
  const gridBgPos = useMotionTemplate`${gridShiftX}px ${gridShiftY}px`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || reduce) return;
    mouseX.set(window.innerWidth / 2);
    mouseY.set(window.innerHeight * 0.28);
    const onMove = (event: globalThis.MouseEvent) => {
      mouseX.set(event.clientX);
      mouseY.set(event.clientY);
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      gridShiftX.set(nx * -12);
      gridShiftY.set(ny * -12);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [isMounted, reduce, mouseX, mouseY, gridShiftX, gridShiftY]);

  const interactive = isMounted && !reduce;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_72%)]" />

      {/* Grid that shifts with the cursor and illuminates under the pointer */}
      {interactive ? (
        <motion.div
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(168,85,247,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(168,85,247,0.14)_1px,transparent_1px)] bg-[size:72px_72px] opacity-70"
          style={{
            backgroundPosition: gridBgPos,
            WebkitMaskImage: gridMask,
            maskImage: gridMask,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(168,85,247,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(168,85,247,0.05)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      )}

      {/* Soft drifting secondary grid */}
      {interactive ? (
        <motion.div
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          animate={{ backgroundPosition: ["0px 0px", "72px 72px"] }}
          transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        />
      ) : null}

      {/* Mouse-following illumination — 1:1 with cursor */}
      {interactive ? (
        <motion.div className="absolute inset-0 opacity-90" style={{ background: glow }} />
      ) : null}

      <motion.div
        className="absolute top-[-8%] left-1/2 h-[560px] w-[920px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.22),transparent_68%)] blur-2xl"
        animate={
          interactive
            ? { opacity: [0.55, 0.85, 0.55], scale: [1, 1.06, 1] }
            : undefined
        }
        transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
      />
      <div className="absolute top-[38%] right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.12),transparent_70%)] blur-3xl" />
      <div className="absolute top-[58%] left-[-8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.14),transparent_70%)] blur-3xl" />
    </div>
  );
}
