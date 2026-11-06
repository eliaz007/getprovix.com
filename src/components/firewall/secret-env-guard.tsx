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
      className="rounded-none border border-white/10 bg-[#141414] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6"
    >
      <p className="text-[11px] font-medium tracking-[0.16em] text-[#c4b5fd] uppercase">Secrets</p>
      <h2 id="secret-guard-heading" className="mt-2 text-xl font-medium tracking-tight text-[#ededed]">
        Secret leak and env guard
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#a1a1aa]">
        Each rule is enforced or off in this browser. A scan still reports OK or FAILED for the rules left on.
      </p>

      <ul className="mt-5 divide-y divide-white/10 overflow-hidden rounded-none border border-white/10 bg-[#141414]">
        {SECRET_RULE_CATALOG.map((rule) => {
          const on = !disabled.includes(rule.id);
          return (
            <li key={rule.id} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-white/5">
              <button type="button" onClick={() => setOpenId(rule.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-[#ededed]">{rule.label}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[#a1a1aa]">{rule.envName}</p>
              </button>
              <span className={`font-mono text-[11px] ${on ? "text-[#10b981]" : "text-[#a1a1aa]"}`}>
                {on ? "OK" : "OFF"}
              </span>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(rule.id)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[#7c3aed]" : "bg-[#18181B]"}`}
              >
                <motion.span
                  layout
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 520, damping: 32 }
                  }
                  className={`absolute top-0.5 h-5 w-5 rounded-full shadow-sm ${on ? "left-5 bg-[#18181B]" : "left-0.5 bg-[#7c3aed]"}`}
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
            className="rounded-none border border-white/10 bg-[#141414] px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-3 font-mono text-[12px]">
              <span className="text-[#ededed]">{check.label}</span>
              <span className="text-[#10b981]">OK</span>
            </div>
            <p className="mt-1 text-[12px] text-[#a1a1aa]">{check.detail}</p>
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="presentation" onClick={onClose}>
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-rule-title"
        initial={reduce ? false : { x: 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#18181B] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-[#c4b5fd] uppercase">Rule</p>
            <h3 id="secret-rule-title" className="mt-2 text-lg font-medium tracking-tight text-[#ededed]">
              {rule.label}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-[#a1a1aa] hover:text-[#ededed]">
            Close
          </button>
        </div>
        <dl className="mt-6 space-y-4 font-mono text-[12px]">
          <div>
            <dt className="text-[#a1a1aa]">ENV</dt>
            <dd className="mt-1 text-[#ededed]">{rule.envName}</dd>
          </div>
          <div>
            <dt className="text-[#a1a1aa]">PATTERN</dt>
            <dd className="mt-1 break-all text-[#ededed]">{rule.pattern}</dd>
          </div>
          <div>
            <dt className="text-[#a1a1aa]">REPLACEMENT</dt>
            <dd className="mt-1 text-[#10b981]">process.env.{rule.envName}</dd>
          </div>
          <div>
            <dt className="text-[#a1a1aa]">.env.example</dt>
            <dd className="mt-1 text-[#ededed]">{rule.envName}=</dd>
          </div>
          <div>
            <dt className="text-[#a1a1aa]">STATE</dt>
            <dd className={`mt-1 ${enabled ? "text-[#10b981]" : "text-[#ef4444]"}`}>{enabled ? "OK" : "OFF"}</dd>
          </div>
        </dl>
        <MotionButton
          type="button"
          onClick={onToggle}
          className="mt-8 rounded-full bg-[#7c3aed] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#6d28d9]"
        >
          {enabled ? "Turn rule off" : "Turn rule on"}
        </MotionButton>
      </motion.aside>
    </div>
  );
}
