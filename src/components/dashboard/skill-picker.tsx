"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import {
  CANDIDATE_SKILLS_LIMIT_TEXT,
  CANDIDATE_SKILLS_PLACEHOLDER,
  MAX_CORE_SKILLS,
  canonicalizeSkillLabel,
  filterSkillSuggestions,
} from "@/lib/candidate-skills";
import { cn } from "@/lib/cn";

type SkillPickerProps = {
  selected: string[];
  onChange: (skills: string[]) => void;
  disabled?: boolean;
};

export default function SkillPicker({
  selected,
  onChange,
  disabled = false,
}: SkillPickerProps) {
  const inputId = useId();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const atLimit = selected.length >= MAX_CORE_SKILLS;
  const inputDisabled = disabled || atLimit;

  const suggestions = useMemo(
    () => filterSkillSuggestions(query, selected),
    [query, selected]
  );

  const canonicalQuery = canonicalizeSkillLabel(query);
  const queryAlreadySelected = Boolean(
    canonicalQuery &&
      selected.some(
        (skill) => skill.toLowerCase() === canonicalQuery.toLowerCase()
      )
  );
  const exactSuggestionMatch = suggestions.some(
    (skill) => skill.toLowerCase() === (canonicalQuery ?? "").toLowerCase()
  );
  const canCreateCustom = Boolean(
    canonicalQuery && !queryAlreadySelected && !exactSuggestionMatch
  );

  const menuItems = useMemo(() => {
    const options: Array<{ type: "option" | "create"; value: string }> =
      suggestions.map((value) => ({
        type: "option",
        value,
      }));

    if (canCreateCustom && canonicalQuery) {
      options.push({ type: "create", value: canonicalQuery });
    }

    return options;
  }, [canCreateCustom, canonicalQuery, suggestions]);

  const menuOpen = open && !inputDisabled && menuItems.length > 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, selected.length]);

  useEffect(() => {
    if (!menuOpen) return;

    const list = listboxRef.current;
    const option = optionRefs.current[highlightIndex];
    if (!list || !option) return;

    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();

    if (optionRect.bottom > listRect.bottom) {
      list.scrollTop += optionRect.bottom - listRect.bottom;
    } else if (optionRect.top < listRect.top) {
      list.scrollTop -= listRect.top - optionRect.top;
    }
  }, [highlightIndex, menuOpen]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const addSkill = (raw: string) => {
    if (inputDisabled) return;

    const nextSkill = canonicalizeSkillLabel(raw);
    if (!nextSkill) return;

    const alreadySelected = selected.some(
      (skill) => skill.toLowerCase() === nextSkill.toLowerCase()
    );
    if (alreadySelected) {
      setQuery("");
      return;
    }

    if (selected.length >= MAX_CORE_SKILLS) return;

    onChange([...selected, nextSkill]);
    setQuery("");
    setHighlightIndex(0);

    const nextCount = selected.length + 1;
    if (nextCount >= MAX_CORE_SKILLS) {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    setOpen(true);
    inputRef.current?.focus();
  };

  const removeSkill = (skill: string) => {
    if (disabled) return;
    onChange(
      selected.filter((value) => value.toLowerCase() !== skill.toLowerCase())
    );
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commitHighlightedOrQuery = () => {
    const highlighted = menuItems[highlightIndex];
    if (highlighted) {
      addSkill(highlighted.value);
      return;
    }

    if (canonicalQuery) {
      addSkill(canonicalQuery);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "Backspace" && query.length === 0 && selected.length > 0) {
      event.preventDefault();
      removeSkill(selected[selected.length - 1]!);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!menuOpen) {
        setOpen(true);
        return;
      }
      setHighlightIndex((current) =>
        menuItems.length === 0 ? 0 : (current + 1) % menuItems.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!menuOpen) {
        setOpen(true);
        return;
      }
      setHighlightIndex((current) =>
        menuItems.length === 0
          ? 0
          : (current - 1 + menuItems.length) % menuItems.length
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitHighlightedOrQuery();
    }
  };

  return (
    <div ref={containerRef}>
      <div className="relative z-20 overflow-visible">
        <div
          className={cn(
            "flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-zinc-800 bg-background px-3 py-2 transition-colors",
            "focus-within:border-zinc-600 focus-within:ring-1 focus-within:ring-zinc-500/40",
            inputDisabled && "cursor-not-allowed"
          )}
          onClick={() => {
            if (!inputDisabled) {
              inputRef.current?.focus();
            }
          }}
        >
          {selected.map((skill) => (
            <span
              key={skill}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/80 py-1 pl-2 pr-1 text-xs font-semibold text-textMain"
            >
              <span className="truncate">{skill}</span>
              <button
                type="button"
                aria-label={`Remove ${skill}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  removeSkill(skill);
                }}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-textMain disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={menuOpen}
            aria-controls={listboxId}
            aria-activedescendant={
              menuOpen && menuItems[highlightIndex]
                ? `${listboxId}-${highlightIndex}`
                : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            disabled={inputDisabled}
            placeholder={selected.length === 0 ? CANDIDATE_SKILLS_PLACEHOLDER : ""}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (!inputDisabled) {
                setOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "bg-transparent py-1 text-sm text-textMain outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed",
              atLimit
                ? "w-0 min-w-0 flex-none overflow-hidden p-0"
                : "min-w-[8rem] flex-1"
            )}
          />
        </div>

        {menuOpen ? (
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
          >
            {menuItems.map((item, index) => {
              const isActive = index === highlightIndex;
              const isCreate = item.type === "create";

              return (
                <li key={`${item.type}-${item.value}`} role="none">
                  <button
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => addSkill(item.value)}
                    className={cn(
                      "w-full cursor-pointer px-3 py-2 text-left text-sm text-zinc-200",
                      "hover:bg-zinc-800/80 focus-visible:bg-zinc-800/80 focus-visible:outline-none",
                      isActive && "bg-zinc-800/80",
                      isCreate && "font-medium"
                    )}
                  >
                    {isCreate ? (
                      <span>
                        Add{" "}
                        <span className="font-semibold text-zinc-100">
                          {item.value}
                        </span>
                      </span>
                    ) : (
                      item.value
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {atLimit ? (
        <p className="mt-2 text-[11px] text-zinc-400">
          {CANDIDATE_SKILLS_LIMIT_TEXT}
        </p>
      ) : null}
    </div>
  );
}
