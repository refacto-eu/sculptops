"use client";

import { useState } from "react";
import { Button, Switch } from "@heroui/react";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Check, Wifi } from "lucide-react";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  fromAddress: string;
  fromName: string;
}

interface Props {
  initial: SmtpConfig | null;
  isAdmin: boolean;
}

export function SmtpConfigPanel({ initial, isAdmin }: Props) {
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(String(initial?.port ?? 587));
  const [secure, setSecure] = useState(initial?.secure ?? false);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState(initial?.fromAddress ?? "");
  const [fromName, setFromName] = useState(initial?.fromName ?? "SculptOps");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function buildPayload() {
    return {
      host,
      port: parseInt(port, 10) || 587,
      secure,
      username: username || undefined,
      password: password || undefined,
      fromAddress,
      fromName,
      recipients: [],
      onFailure: true,
      onSuccess: false,
      enabled: false,
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/notifications/smtp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
    }
  }

  async function handleVerify() {
    if (!host) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/notifications/smtp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: parseInt(port, 10) || 587,
          secure,
          username: username || undefined,
          password: password || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setVerifyResult(data);
    } catch {
      setVerifyResult({ ok: false, error: "Request failed" });
    }
    setVerifying(false);
    setTimeout(() => setVerifyResult(null), 6000);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="SMTP host" value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.gmail.com" disabled={!isAdmin} />
        </div>
        <Field label="Port" type="number" value={port} onChange={e => setPort(e.target.value)} placeholder="587" disabled={!isAdmin} />
      </div>

      <div className="flex items-center gap-2">
        <Switch isSelected={secure} onValueChange={setSecure} isDisabled={!isAdmin} color="primary" size="sm" />
        <span className="text-sm text-th-secondary">Use SSL/TLS (port 465)</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Username" value={username} onChange={e => setUsername(e.target.value)} placeholder="user@gmail.com" disabled={!isAdmin} />
        <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={initial ? "Leave blank to keep current" : "SMTP password"} disabled={!isAdmin} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From address" type="email" value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder="alerts@yourcompany.com" disabled={!isAdmin} />
        <Field label="From name" value={fromName} onChange={e => setFromName(e.target.value)} placeholder="SculptOps" disabled={!isAdmin} />
      </div>

      <FormError error={error} />

      {verifyResult && (
        <div className={`text-sm rounded-lg px-3 py-2 ${verifyResult.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
          {verifyResult.ok ? "Connection successful — SMTP is reachable." : `Connection failed: ${verifyResult.error ?? "Unknown error"}`}
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" className="btn-primary" isLoading={saving} startContent={saved ? <Check className="h-3.5 w-3.5" /> : undefined} onPress={handleSave}>
            {saved ? "Saved!" : "Save"}
          </Button>
          <Button size="sm" className="btn-secondary-outline" isDisabled={!host} isLoading={verifying} startContent={<Wifi className="h-3.5 w-3.5" />} onPress={handleVerify}>
            Test connection
          </Button>
        </div>
      )}
    </div>
  );
}
