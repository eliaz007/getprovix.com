"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { MotionButton } from "@/components/landing/landing-motion";
import { SECRET_RULE_CATALOG, type SecretRuleCatalogEntry } from "@/lib/scanner/security-suite";

const STORAGE_KEY = "provix.secret-guard.disabled";

const ENV_CHECKS = [
  { id: "blank-env", label: "Committed env values stay blank", detail: ".env.example receives NAME= with an empty value." },
  { id: "client-boundary", label: "Service keys stay off the client", detail: "Client files call getSecret() instead of reading the key." },
  { id: "process-env", label: "Replacement is process.env", detail: "The patched line reads process.env.NAME." },
] as const;

function readDisabled(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export default function SecretEnvGuard(): ReactNode {
  const [disabled, setDisabled] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRule = SECRET_RULE_CATALOG.find((rule) => rule.id === openId) ?? null;
  const reduce = useReducedMotion();

  useEffect(() => {
    setDisabled(readDisabled());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(disabled));
  }, [disabled, ready]);

  function toggle(id: string) {
    setDisabled((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <section
      aria-labelledby="secret-guard-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:p-6"
    >
      <p className="font-mono text-[11px] tracking-[0.18em] text-purple-400 uppercase">Secrets</p>
      <h2 id="secret-guard-heading" className="mt-2 text-xl font-semibold tracking-tight text-[#f9fafb]">
        Secret leak and env guard
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#f9fafb]/65">
        Each rule is enforced or off in this browser. A scan still reports OK or FAILED for the rules left on.
      </p>

      <ul className="mt-5 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-black/30">
        {SECRET_RULE_CATALOG.map((rule) => {
          const on = !disabled.includes(rule.id);
          return (
            <li key={rule.id} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-white/[0.03]">
              <button type="button" onClick={() => setOpenId(rule.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-[#f9fafb]">{rule.label}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[#f9fafb]/40">{rule.envName}</p>
              </button>
              <span className={`font-mono text-[11px] ${on ? "text-[#34d399]" : "text-[#f9fafb]/35"}`}>
                {on ? "OK" : "OFF"}
              </span>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(rule.id)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-purple-600" : "bg-white/15"}`}
              >
                <motion.span
                  layout
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 520, damping: 32 }
                  }
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${on ? "left-5" : "left-0.5"}`}
                />
                <span className="sr-only">{on ? `Turn off ${rule.label}` : `Turn on ${rule.label}`}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="mt-4 space-y-2">
        {ENV_CHECKS.map((check) => (
          <li
            key={check.id}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 backdrop-blur-sm transition-colors hover:border-white/15"
          >
            <div className="flex items-baseline justify-between gap-3 font-mono text-[12px]">
              <span className="text-[#f9fafb]/80">{check.label}</span>
              <span className="text-[#34d399]">OK</span>
            </div>
            <p className="mt-1 text-[12px] text-[#f9fafb]/45">{check.detail}</p>
          </li>
        ))}
      </ul>

      {openRule ? (
        <RuleDrawer
          rule={openRule}
          enabled={!disabled.includes(openRule.id)}
          onToggle={() => toggle(openRule.id)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

function RuleDrawer({
  rule,
  enabled,
  onToggle,
  onClose,
}: {
  rule: SecretRuleCatalogEntry;
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}): ReactNode {
  const reduce = useReducedMotion();
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-rule-title"
        initial={reduce ? false : { x: 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0e1117]/95 p-6 shadow-[-24px_0_80px_-32px_rgba(168,85,247,0.45)] backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-purple-400 uppercase">Rule</p>
            <h3 id="secret-rule-title" className="mt-2 text-lg font-semibold text-[#f9fafb]">
              {rule.label}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-[#f9fafb]/60 hover:text-[#f9fafb]">
            Close
          </button>
        </div>
        <dl className="mt-6 space-y-4 font-mono text-[12px]">
          <div>
            <dt className="text-[#f9fafb]/40">ENV</dt>
            <dd className="mt-1 text-[#f9fafb]">{rule.envName}</dd>
          </div>
          <div>
            <dt className="text-[#f9fafb]/40">PATTERN</dt>
            <dd className="mt-1 break-all text-[#f9fafb]/80">{rule.pattern}</dd>
          </div>
          <div>
            <dt className="text-[#f9fafb]/40">REPLACEMENT</dt>
            <dd className="mt-1 text-purple-300">process.env.{rule.envName}</dd>
          </div>
          <div>
            <dt className="text-[#f9fafb]/40">.env.example</dt>
            <dd className="mt-1 text-[#f9fafb]">{rule.envName}=</dd>
          </div>
          <div>
            <dt className="text-[#f9fafb]/40">STATE</dt>
            <dd className={`mt-1 ${enabled ? "text-[#34d399]" : "text-rose-400"}`}>{enabled ? "OK" : "OFF"}</dd>
          </div>
        </dl>
        <MotionButton
          type="button"
          onClick={onToggle}
          className="mt-8 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
        >
          {enabled ? "Turn rule off" : "Turn rule on"}
        </MotionButton>
      </motion.aside>
    </div>
  );
}
