"use client";

import { useState } from "react";
import { SkillChip } from "./ui";

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type a skill and press Enter",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const matches = suggestions
    .filter((s) => !value.includes(s) && draft && s.toLowerCase().includes(draft.toLowerCase()))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <SkillChip key={t} tag={t} onRemove={() => remove(t)} />
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          placeholder={placeholder}
        />
        {matches.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full mt-1 z-20 rounded-md border overflow-hidden"
            style={{ background: "var(--bg-surface-hi)", borderColor: "var(--border-default)" }}
          >
            {matches.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => add(m)}
                className="block w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-[var(--bg-surface)]"
                style={{ color: "var(--text-secondary)" }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
