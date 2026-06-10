"use client";

import { useState } from "react";
import { Button, Switch } from "@heroui/react";
import { FormError } from "@/components/ui/form-error";
import { Check, Send, Plus, X } from "lucide-react";

interface SmtpNotifConfig {
  enabled: boolean;
  recipients: string[];
  onFailure: boolean;
  onSuccess: boolean;
}

interface Props {
  initial: SmtpNotifConfig | null;
  isAdmin: boolean;
  smtpConfigured: boolean;
}

export function SmtpNotificationsPanel({ initial, isAdmin, smtpConfigured }: Props) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? []);
  const [recipientInput, setRecipientInput] = useState("");
  const [onFailure, setOnFailure] = useState(initial?.onFailure ?? true);
  const [onSuccess, setOnSuccess] = useState(initial?.onSuccess ?? false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const disabled = !isAdmin || !smtpConfigured;

  function addRecipient() {
    const email = recipientInput.trim().toLowerCase();
    if (!email || recipients.includes(email)) return;
    setRecipients(prev => [...prev, email]);
    setRecipientInput("");
  }

  function removeRecipient(email: string) {
    setRecipients(prev => prev.filter(r => r !== email));
  }

  async function handleSave() {
    const pending = recipientInput.trim().toLowerCase();
    const finalRecipients = pending && !recipients.includes(pending) ? [...recipients, pending] : recipients;
    if (pending && !recipients.includes(pending)) { setRecipients(finalRecipients); setRecipientInput(""); }

    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/notifications/smtp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, recipients: finalRecipients, onFailure, onSuccess }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
    }
  }

  async function handleTest() {
    if (recipients.length === 0) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/notifications/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: res.ok, message: data.error });
    } catch { setTestResult({ ok: false, message: "Request failed" }); }
    setTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  }

  if (!smtpConfigured) {
    return (
      <div className="rounded-lg bg-card border border-border-base/50 px-4 py-3 text-sm text-th-subtle">
        Configure SMTP above before enabling email notifications.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-th-secondary">Send email notifications when executions complete.</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-th-muted">{enabled ? "Enabled" : "Disabled"}</span>
          <Switch isSelected={enabled} onValueChange={setEnabled} isDisabled={disabled} color="success" size="sm" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-th-secondary">Recipients</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={recipientInput}
            onChange={e => setRecipientInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addRecipient())}
            placeholder="ops@yourcompany.com"
            disabled={disabled}
            className="flex-1 rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
          />
          <Button size="sm" variant="flat" isDisabled={disabled || !recipientInput.trim()} onPress={addRecipient} startContent={<Plus className="h-3.5 w-3.5" />}>
            Add
          </Button>
        </div>
        {recipients.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {recipients.map(r => (
              <span key={r} className="flex items-center gap-1.5 bg-input text-th-secondary text-xs px-2.5 py-1 rounded-full">
                {r}
                {isAdmin && (
                  <button type="button" onClick={() => removeRecipient(r)} className="text-th-muted hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-th-secondary">Notify on</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Switch isSelected={onFailure} onValueChange={setOnFailure} isDisabled={disabled} color="danger" size="sm" />
            <span className="text-sm text-th-secondary">Execution failure</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch isSelected={onSuccess} onValueChange={setOnSuccess} isDisabled={disabled} color="success" size="sm" />
            <span className="text-sm text-th-secondary">Execution success</span>
          </div>
        </div>
      </div>

      <FormError error={error} />

      {testResult && (
        <div className={`text-sm rounded-lg px-3 py-2 ${testResult.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
          {testResult.ok ? "Test email sent successfully." : `Failed: ${testResult.message ?? "Unknown error"}`}
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" className="btn-primary" isLoading={saving} startContent={saved ? <Check className="h-3.5 w-3.5" /> : undefined} onPress={handleSave}>
            {saved ? "Saved!" : "Save"}
          </Button>
          <Button size="sm" className="btn-secondary-outline" isDisabled={recipients.length === 0} isLoading={testing} startContent={<Send className="h-3.5 w-3.5" />} onPress={handleTest}>
            Send test email
          </Button>
        </div>
      )}
    </div>
  );
}
