"use client";

import { useEffect, useState } from "react";
import { Button, Field, Modal, useToast } from "./ui";
import { api } from "@/lib/client";
import type { Project } from "@/lib/types";

export function ProjectForm({
  open,
  onClose,
  onSaved,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: Project) => void;
  existing?: Project | null;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setDeadline(existing?.deadline ?? "");
    }
  }, [open, existing]);

  const save = async () => {
    if (!name.trim() || !deadline) {
      toast("Name and deadline are required", "error");
      return;
    }
    setBusy(true);
    try {
      const p = existing
        ? await api.updateProject(existing.id, name.trim(), deadline)
        : await api.createProject(name.trim(), deadline);
      toast(existing ? "Project updated" : "Project created", "success");
      onSaved(p);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit project" : "New project"}>
      <div className="flex flex-col gap-5">
        <Field label="Project name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Website Relaunch" autoFocus />
        </Field>
        <Field label="Deadline">
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
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
