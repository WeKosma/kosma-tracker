"use client";

import { useState, useTransition } from "react";
import { saveRow } from "@/app/actions";
import { useUi } from "./ui";

export default function TaskCheck({ id, done, disabled }: { id: string; done: boolean; disabled?: boolean }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  const { toast } = useUi();
  return (
    <input
      type="checkbox"
      className="check"
      style={{ accentColor: "var(--fg)", width: 15, height: 15, cursor: "pointer" }}
      checked={checked}
      disabled={disabled || pending}
      aria-label="Completar tarea"
      onChange={(e) => {
        const v = e.target.checked;
        setChecked(v);
        start(async () => {
          const r = await saveRow("tasks", { id, done: v });
          if (!r.ok) { setChecked(!v); toast(r.error, "error"); }
          else if (v) toast("Tarea completada");
        });
      }}
    />
  );
}
