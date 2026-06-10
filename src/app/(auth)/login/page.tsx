"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { Field } from "@/components/ui/field";
import { Play, Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) setError("Invalid email or password");
    else router.push("/dashboard");
  }

  return (
    <Card className="w-full max-w-md bg-card border border-border-base">
      <CardHeader className="flex flex-col items-center gap-3 pb-0 pt-8">
        <img src="/brand/SculptOps_icon_light_mode.svg" alt="SculptOps" className="h-12 w-12 rounded-xl" />
        <div className="text-center">
          <img src="/brand/ScultOps_logo_dark_mode.png" alt="SculptOps" className="h-7 object-contain mx-auto mb-1" />
          <p className="text-sm text-th-muted">Sign in to your account</p>
        </div>
      </CardHeader>
      <CardBody className="px-8 pb-8 pt-6">
        {justRegistered && (
          <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2.5 text-sm text-emerald-500">
            Account created! Sign in to get started.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-th-secondary">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg bg-input border border-border-base px-3 py-2 pr-10 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-secondary">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" color="success" className="w-full font-semibold" isLoading={loading}>Sign in</Button>
        </form>
        <p className="mt-6 text-center text-sm text-th-muted">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-emerald-500 hover:text-emerald-400 font-medium">Create one</Link>
        </p>
      </CardBody>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
