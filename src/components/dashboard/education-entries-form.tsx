"use client";

import { Trash2 } from "lucide-react";
import {
  CREDENTIAL_TYPE_OPTIONS,
  MAX_EDUCATION_ENTRIES,
  SELF_TAUGHT_CHECKBOX_LABEL,
  SELF_TAUGHT_ENGINEER_LABEL,
  SELF_TAUGHT_PROFILE_CONFIRMATION,
  createEmptyEducationEntry,
  type EducationEntry,
} from "@/lib/candidate-education";

const inputClass =
  "w-full bg-[#070709] border border-white/[0.08] rounded-xl p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20";

const labelClass =
  "block text-[11px] font-bold text-textMuted mb-2 uppercase";

type EducationEntriesFormProps = {
  entries: EducationEntry[];
  onChange: (entries: EducationEntry[]) => void;
  isSelfTaught: boolean;
  onSelfTaughtChange: (value: boolean) => void;
  disabled?: boolean;
};

export default function EducationEntriesForm({
  entries,
  onChange,
  isSelfTaught,
  onSelfTaughtChange,
  disabled = false,
}: EducationEntriesFormProps) {
  const atLimit = entries.length >= MAX_EDUCATION_ENTRIES;

  const updateEntry = (id: string, patch: Partial<EducationEntry>) => {
    onChange(
      entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };

  const addEntry = () => {
    if (disabled || atLimit) return;
    onChange([...entries, createEmptyEducationEntry()]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-textMain">Education</h3>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 select-none">
          <input
            type="checkbox"
            checked={isSelfTaught}
            disabled={disabled}
            onChange={(event) => onSelfTaughtChange(event.target.checked)}
            className="h-4 w-4 shrink-0 rounded border border-zinc-700 bg-zinc-950 accent-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-sm text-zinc-200">
            {SELF_TAUGHT_CHECKBOX_LABEL}
          </span>
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-textMuted">
          Optional. Add up to {MAX_EDUCATION_ENTRIES} programs or credentials,
          or mark yourself as self-taught.
        </p>
      </div>

      {isSelfTaught ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
          Displayed on your public profile as:{" "}
          <span className="font-semibold text-textMain">
            {SELF_TAUGHT_ENGINEER_LABEL}
          </span>
        </div>
      ) : (
        <>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-background px-4 py-6 text-sm text-textMuted">
          No education added yet.
        </div>
      ) : (
        entries.map((entry, index) => (
          <div
            key={entry.id}
            className="space-y-4 rounded-xl border border-zinc-800 bg-background p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-textMuted">
                Entry {index + 1}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeEntry(entry.id)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            </div>

            <div>
              <label className={labelClass} htmlFor={`education-institution-${entry.id}`}>
                Institution / Program name{" "}
                <span className="text-rose-400">*</span>
              </label>
              <input
                id={`education-institution-${entry.id}`}
                type="text"
                value={entry.institution}
                disabled={disabled}
                placeholder="Stanford University, App Academy, ..."
                onChange={(event) =>
                  updateEntry(entry.id, { institution: event.target.value })
                }
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor={`education-credential-${entry.id}`}>
                  Credential type
                </label>
                <select
                  id={`education-credential-${entry.id}`}
                  value={entry.credentialType}
                  disabled={disabled}
                  onChange={(event) =>
                    updateEntry(entry.id, {
                      credentialType: event.target.value as EducationEntry["credentialType"],
                    })
                  }
                  className={`${inputClass} cursor-pointer`}
                >
                  {CREDENTIAL_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor={`education-field-${entry.id}`}>
                  Field of study
                </label>
                <input
                  id={`education-field-${entry.id}`}
                  type="text"
                  value={entry.fieldOfStudy}
                  disabled={disabled}
                  placeholder="Computer Science"
                  onChange={(event) =>
                    updateEntry(entry.id, { fieldOfStudy: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor={`education-year-${entry.id}`}>
                Graduation / completion year
              </label>
              <input
                id={`education-year-${entry.id}`}
                type="text"
                inputMode="numeric"
                value={entry.graduationYear}
                disabled={disabled}
                placeholder="2026"
                onChange={(event) =>
                  updateEntry(entry.id, { graduationYear: event.target.value })
                }
                className={`${inputClass} font-mono sm:max-w-xs`}
              />
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        disabled={disabled || atLimit}
        onClick={addEntry}
        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-background px-3.5 py-2 text-xs font-bold text-textMain transition-colors hover:border-zinc-600 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Add Education
      </button>
        </>
      )}
    </div>
  );
}
