"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Play, Eye, EyeOff } from "lucide-react";

interface InviteInfo { orgName: string; role: string; expiresAt: string }

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invites/info?token=${inviteToken}`).then(r => r.json()).then(data => {
      if (data.error) setInviteError(data.error);
      else setInviteInfo(data);
    }).catch(() => setInviteError("Failed to load invite"));
  }, [inviteToken]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    if (!inviteToken && !form.orgName.trim()) e.orgName = "Organization name is required";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 8) e.password = "At least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setApiError("");
    setLoading(true);
    const body = inviteToken
      ? { name: form.name, email: form.email, password: form.password, inviteToken }
      : { name: form.name, email: form.email, password: form.password, orgName: form.orgName };
    const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (res.ok) router.push("/login?registered=1");
    else { const data = await res.json().catch(() => ({})); setApiError(data.error ?? "Registration failed."); }
  }

  const isInviteMode = Boolean(inviteToken);

  return (
    <Card className="w-full max-w-md bg-card border border-border-base">
      <CardHeader className="flex flex-col items-center gap-3 pb-0 pt-8">
        <img src="/brand/SculptOps_icon_light_mode.svg" alt="SculptOps" className="h-12 w-12 rounded-xl" />
        <div className="text-center">
          <img src="/brand/ScultOps_logo_dark_mode.png" alt="SculptOps" className="h-7 object-contain mx-auto mb-1" />
          <p className="text-sm text-th-muted mt-1">{isInviteMode ? "Accept your invitation" : "Create your account"}</p>
        </div>
      </CardHeader>
      <CardBody className="px-8 pb-8 pt-6">
        {isInviteMode && inviteInfo && (
          <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2.5 text-sm text-emerald-500">
            You&apos;re joining <strong>{inviteInfo.orgName}</strong> as <strong className="capitalize">{inviteInfo.role}</strong>.
          </div>
        )}
        {isInviteMode && inviteError && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-400">
            {inviteError} — ask an admin to generate a new link.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" error={errors.name} />
          {!isInviteMode && <Field label="Organization name" value={form.orgName} onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} placeholder="My Company" error={errors.orgName} />}
          <Field label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" error={errors.email} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className={`text-sm font-medium ${errors.password ? "text-red-400" : "text-th-secondary"}`}>Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                className={`w-full rounded-lg bg-input border px-3 py-2 pr-10 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 transition-colors ${errors.password ? "border-red-500/70 focus:ring-red-500/50" : "border-border-base focus:ring-emerald-500/50 focus:border-emerald-500/50"}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-secondary">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
          </div>
          <FormError error={apiError} />
          <Button type="submit" color="success" className="w-full font-semibold" isLoading={loading} isDisabled={isInviteMode && Boolean(inviteError)}>
            {isInviteMode ? "Join organization" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-th-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-500 hover:text-emerald-400 font-medium">Sign in</Link>
        </p>
      </CardBody>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
