"use client";

import { useEffect, useState } from "react";
import { Button, Field, Modal, useToast } from "./ui";
import { TagInput } from "./TagInput";
import { api } from "@/lib/client";
import type { Resource } from "@/lib/types";

export function ResourceForm({
  open,
  onClose,
  onSaved,
  existing,
  suggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Resource | null;
  suggestions?: string[];
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [capacity, setCapacity] = useState("8");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setSkills(existing?.skills ?? []);
      setCapacity(String(existing?.capacityHoursPerDay ?? 8));
    }
  }, [open, existing]);

  const save = async () => {
    const cap = Number(capacity);
    if (!name.trim()) return toast("Name is required", "error");
    if (!Number.isFinite(cap) || cap <= 0) return toast("Capacity must be positive", "error");
    setBusy(true);
    try {
      if (existing) await api.updateResource(existing.id, name.trim(), skills, cap);
      else await api.createResource(name.trim(), skills, cap);
      toast(existing ? "Resource updated" : "Resource added", "success");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit resource" : "New resource"}>
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
        </Field>
        <Field label="Skill tags" hint="Type a skill and press Enter. These drive auto-matching.">
          <TagInput value={skills} onChange={setSkills} suggestions={suggestions} />
        </Field>
        <Field label="Capacity (hours/day)">
          <input type="number" min={1} step={0.5} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={busy}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
