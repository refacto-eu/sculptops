"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { CheckCircle, AlertCircle, ExternalLink, Trash2 } from "lucide-react";

interface Props {
  initialConfigured: boolean;
  communityConfigured: boolean;
}

export function CommunityPanel({ initialConfigured, communityConfigured }: Props) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [token,      setToken]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [removing,   setRemoving]   = useState(false);
  const [feedback,   setFeedback]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function flash(type: "success" | "error", msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) throw new Error();
      setConfigured(true);
      setToken("");
      flash("success", "Token saved successfully.");
    } catch { flash("error", "Failed to save token."); }
    finally { setSaving(false); }
  }

  async function remove() {
    setRemoving(true);
    try {
      await fetch("/api/user/community", { method: "DELETE" });
      setConfigured(false);
      flash("success", "Token removed.");
    } catch { flash("error", "Failed to remove token."); }
    finally { setRemoving(false); }
  }

  if (!communityConfigured) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-th-subtle">Publish verified playbooks to the community library.</p>
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-input/50 border border-border-base text-sm text-th-subtle">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Community library not configured. Set <span className="font-mono text-xs">COMMUNITY_API_URL</span> to enable.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      <p className="text-sm text-th-subtle leading-relaxed">
        Get a token at{" "}
        <a href="https://sculptops.dev/connect" target="_blank" rel="noopener noreferrer"
          className="text-emerald-400 hover:underline inline-flex items-center gap-1">
          sculptops.dev/connect <ExternalLink className="h-3 w-3" />
        </a>
        {" "}by connecting your GitHub or GitLab account, then paste it below.
        Your author identity will be selectable when submitting a playbook.
      </p>

      {/* Status */}
      {configured && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <p className="text-sm font-medium text-th-primary">Token configured</p>
          </div>
          <Button size="sm" variant="flat" color="danger" isLoading={removing}
            startContent={!removing && <Trash2 className="h-3.5 w-3.5" />}
            onPress={remove}>
            Remove
          </Button>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
          feedback.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {feedback.type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {/* Token input */}
      <div className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder={configured ? "Paste new token to replace…" : "Paste your token…"}
          className="flex-1 rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
          onKeyDown={e => { if (e.key === "Enter") save(); }}
        />
        <Button size="sm" className="btn-primary" isLoading={saving} isDisabled={!token.trim()} onPress={save}>
          Save
        </Button>
      </div>

      <p className="text-xs text-th-subtle/60">
        Organization memberships must be <strong className="text-th-subtle">public</strong> on GitHub/GitLab to appear as identity options.
      </p>

    </div>
  );
}
