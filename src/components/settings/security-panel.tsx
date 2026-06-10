"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { Eye, EyeOff, Check } from "lucide-react";
import { FormError } from "@/components/ui/form-error";

export function SecurityPanel() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.current) e.current = "Required";
    if (!form.next) e.next = "Required";
    else if (form.next.length < 8) e.next = "At least 8 characters";
    if (form.next !== form.confirm) e.confirm = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setApiError(null);
    setSaved(false);

    const res = await fetch("/api/auth/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setSaved(false), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "Failed to update password");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasswordField
        label="Current password"
        value={form.current}
        onChange={v => setForm(f => ({ ...f, current: v }))}
        show={show.current}
        onToggle={() => setShow(s => ({ ...s, current: !s.current }))}
        error={errors.current}
      />
      <PasswordField
        label="New password"
        value={form.next}
        onChange={v => setForm(f => ({ ...f, next: v }))}
        show={show.next}
        onToggle={() => setShow(s => ({ ...s, next: !s.next }))}
        error={errors.next}
      />
      <PasswordField
        label="Confirm new password"
        value={form.confirm}
        onChange={v => setForm(f => ({ ...f, confirm: v }))}
        show={show.next}
        onToggle={() => setShow(s => ({ ...s, next: !s.next }))}
        error={errors.confirm}
      />

      <FormError error={apiError} />

      {saved && (
        <p className="text-sm text-emerald-400 flex items-center gap-1.5">
          <Check className="h-4 w-4" /> Password updated.
        </p>
      )}

      <Button type="submit" className="btn-secondary-outline" isLoading={saving}>
        Update password
      </Button>
    </form>
  );
}

function PasswordField({ label, value, onChange, show, onToggle, error }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-sm font-medium ${error ? "text-red-400" : "text-th-secondary"}`}>{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          className={`w-full rounded-lg bg-input border px-3 py-2 pr-10 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 transition-colors ${error ? "border-red-500/70 focus:ring-red-500/50" : "border-border-base focus:ring-emerald-500/50 focus:border-emerald-500/50"}`}
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-secondary">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
