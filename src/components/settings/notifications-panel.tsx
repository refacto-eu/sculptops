"use client";

import { useState } from "react";
import { Button, Switch } from "@heroui/react";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Send, Check } from "lucide-react";

type ChannelType = "generic" | "slack" | "discord";

interface ChannelConfig {
  webhookUrl: string;
  onFailure: boolean;
  onSuccess: boolean;
  enabled: boolean;
}

interface DbRow {
  channelType: string;
  webhookUrl: string | null;
  onFailure: boolean;
  onSuccess: boolean;
  enabled: boolean;
}

interface Props {
  configs: DbRow[];
  isAdmin: boolean;
}

const CHANNELS: { value: ChannelType; label: string; description: string; placeholder: string }[] = [
  {
    value: "generic",
    label: "Generic Webhook",
    description: "Plain JSON payload to any endpoint",
    placeholder: "https://hooks.example.com/notify",
  },
  {
    value: "slack",
    label: "Slack",
    description: "Formatted message with color and fields",
    placeholder: "https://hooks.slack.com/services/…",
  },
  {
    value: "discord",
    label: "Discord",
    description: "Embed message via Discord webhook",
    placeholder: "https://discord.com/api/webhooks/…",
  },
];

const DEFAULT_CONFIG: ChannelConfig = {
  webhookUrl: "",
  onFailure: true,
  onSuccess: false,
  enabled: false,
};

function initConfigs(rows: DbRow[]): Record<ChannelType, ChannelConfig> {
  const result: Record<ChannelType, ChannelConfig> = {
    generic: { ...DEFAULT_CONFIG },
    slack: { ...DEFAULT_CONFIG },
    discord: { ...DEFAULT_CONFIG },
  };
  for (const row of rows) {
    const t = row.channelType as ChannelType;
    if (t in result) {
      result[t] = {
        webhookUrl: row.webhookUrl ?? "",
        onFailure: row.onFailure,
        onSuccess: row.onSuccess,
        enabled: row.enabled,
      };
    }
  }
  return result;
}

export function NotificationsPanel({ configs: initialConfigs, isAdmin }: Props) {
  const [activeChannel, setActiveChannel] = useState<ChannelType>("generic");
  const [configs, setConfigs] = useState<Record<ChannelType, ChannelConfig>>(() =>
    initConfigs(initialConfigs)
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);

  const cfg = configs[activeChannel];

  function updateCfg(patch: Partial<ChannelConfig>) {
    setConfigs(prev => ({ ...prev, [activeChannel]: { ...prev[activeChannel], ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelType: activeChannel,
        webhookUrl: cfg.webhookUrl.trim() || null,
        onFailure: cfg.onFailure,
        onSuccess: cfg.onSuccess,
        enabled: cfg.enabled,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save settings");
    }
  }

  async function handleTest() {
    if (!cfg.webhookUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: cfg.webhookUrl.trim(), channelType: activeChannel }),
      });
      setTestResult(res.ok ? "ok" : "error");
    } catch { setTestResult("error"); }
    setTesting(false);
    setTimeout(() => setTestResult(null), 4000);
  }

  const channel = CHANNELS.find(c => c.value === activeChannel)!;

  return (
    <div className="space-y-5">
      {/* Channel tabs */}
      <div className="flex gap-2">
        {CHANNELS.map(c => {
          const isEnabled = configs[c.value].enabled;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => { setActiveChannel(c.value); setSaved(false); setError(null); setTestResult(null); }}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                activeChannel === c.value
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : "border-border-base bg-input text-th-muted hover:border-border-strong"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.label}</span>
                {isEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </div>
              <div className="text-xs font-normal mt-0.5 opacity-70">{c.description}</div>
            </button>
          );
        })}
      </div>

      {/* Per-channel settings */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-th-secondary">Enable {channel.label} notifications</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-th-muted">{cfg.enabled ? "Enabled" : "Disabled"}</span>
          <Switch isSelected={cfg.enabled} onValueChange={v => updateCfg({ enabled: v })} isDisabled={!isAdmin} color="success" size="sm" />
        </div>
      </div>

      <Field
        label={`${channel.label} Webhook URL`}
        type="url"
        value={cfg.webhookUrl}
        onChange={e => updateCfg({ webhookUrl: e.target.value })}
        placeholder={channel.placeholder}
        disabled={!isAdmin}
      />

      {activeChannel === "slack" && (
        <div className="text-xs text-th-subtle bg-card rounded-lg p-3 space-y-1">
          <p className="text-th-muted font-medium">How to get a Slack webhook URL:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Go to <span className="text-th-secondary">api.slack.com/apps</span> → Create new app → From scratch</li>
            <li>Enable <span className="text-th-secondary">Incoming Webhooks</span> → Add new webhook to workspace</li>
            <li>Pick a channel, copy the URL and paste it above</li>
          </ol>
        </div>
      )}

      {activeChannel === "discord" && (
        <div className="text-xs text-th-subtle bg-card rounded-lg p-3 space-y-1">
          <p className="text-th-muted font-medium">How to get a Discord webhook URL:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Open your Discord server → Channel settings → Integrations</li>
            <li>Click <span className="text-th-secondary">Create Webhook</span>, give it a name</li>
            <li>Copy Webhook URL and paste it above</li>
          </ol>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-th-secondary">Notify on</p>
        <div className="flex flex-col gap-2">
          <Switch isSelected={cfg.onFailure} onValueChange={v => updateCfg({ onFailure: v })} isDisabled={!isAdmin} color="danger" size="sm">
            <span className="text-sm text-th-secondary">Execution failure</span>
          </Switch>
          <Switch isSelected={cfg.onSuccess} onValueChange={v => updateCfg({ onSuccess: v })} isDisabled={!isAdmin} color="success" size="sm">
            <span className="text-sm text-th-secondary">Execution success</span>
          </Switch>
        </div>
      </div>

      <FormError error={error} />

      {testResult && (
        <div className={`text-sm rounded-lg px-3 py-2 ${testResult === "ok" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
          {testResult === "ok" ? "Test request sent successfully." : "Test request failed — check the URL."}
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" className="btn-primary" isLoading={saving} startContent={saved ? <Check className="h-3.5 w-3.5" /> : undefined} onPress={handleSave}>
            {saved ? "Saved!" : "Save"}
          </Button>
          <Button size="sm" className="btn-secondary-outline" isDisabled={!cfg.webhookUrl.trim()} isLoading={testing} startContent={<Send className="h-3.5 w-3.5" />} onPress={handleTest}>
            Send test
          </Button>
        </div>
      )}
    </div>
  );
}
