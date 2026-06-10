"use client";

import { useState, useRef, useEffect } from "react";
import { Button, Chip } from "@heroui/react";
import { Trash2, ChevronDown, AlertTriangle } from "lucide-react";
import type { MemberRole } from "@/lib/get-org";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  createdAt: Date;
}

interface Props {
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}

const ROLE_COLORS: Record<MemberRole, "warning" | "primary" | "default"> = {
  admin: "warning",
  member: "primary",
  viewer: "default",
};

const ROLES: { value: MemberRole; label: string; description: string }[] = [
  { value: "admin",  label: "Admin",  description: "Full access, can manage members" },
  { value: "member", label: "Member", description: "Can create and run playbooks" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

function RoleSelect({ value, disabled, onChange }: {
  value: MemberRole;
  disabled: boolean;
  onChange: (role: MemberRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-input border border-border-base hover:border-border-strong text-sm text-th-primary transition-colors disabled:opacity-50 disabled:cursor-default min-w-[100px] justify-between"
      >
        <span className="capitalize">{value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-th-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="fixed z-[9999] w-52 bg-card border border-border-base rounded-xl shadow-2xl overflow-hidden py-1"
          style={{ top: pos.top, right: pos.right }}
        >
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => { setOpen(false); if (r.value !== value) onChange(r.value); }}
              className={`w-full flex flex-col items-start px-3 py-2.5 text-left transition-colors hover:bg-input ${r.value === value ? "bg-input/60" : ""}`}
            >
              <span className={`text-sm font-medium ${r.value === value ? "text-emerald-400" : "text-th-primary"}`}>
                {r.label}
                {r.value === value && <span className="ml-2 text-xs text-emerald-400/60">current</span>}
              </span>
              <span className="text-xs text-th-subtle mt-0.5">{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminWarningModal({ memberName, onConfirm, onCancel }: {
  memberName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm bg-card border border-border-base rounded-xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-th-primary">Grant admin access?</p>
            <p className="text-xs text-th-subtle mt-0.5">{memberName}</p>
          </div>
        </div>
        <p className="text-sm text-th-muted leading-relaxed">
          Admins can manage members, change roles, delete playbooks, and access all organization settings. This action can be reversed.
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="flat" className="flex-1" onPress={onCancel}>Cancel</Button>
          <Button size="sm" color="warning" variant="flat" className="flex-1" onPress={onConfirm}>
            Grant admin
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MembersPanel({ members: initial, currentUserId, isAdmin }: Props) {
  const [members,  setMembers]  = useState(initial);
  const [loading,  setLoading]  = useState<string | null>(null);
  const [adminWarn, setAdminWarn] = useState<{ userId: string; name: string } | null>(null);

  async function changeRole(userId: string, role: MemberRole) {
    setLoading(userId);
    try {
      const res = await fetch(`/api/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m));
    } finally {
      setLoading(null);
    }
  }

  function handleRoleChange(userId: string, name: string | null, email: string, role: MemberRole) {
    if (role === "admin") {
      setAdminWarn({ userId, name: name ?? email });
    } else {
      changeRole(userId, role);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    setLoading(userId);
    try {
      const res = await fetch(`/api/members/${userId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {adminWarn && (
        <AdminWarningModal
          memberName={adminWarn.name}
          onConfirm={() => { changeRole(adminWarn.userId, "admin"); setAdminWarn(null); }}
          onCancel={() => setAdminWarn(null)}
        />
      )}

      <div className="space-y-2">
        {members.map(m => (
          <div key={m.userId} className="flex items-center gap-3 py-3 border-b border-border-base/50 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-th-primary truncate">{m.name ?? m.email}</p>
              {m.name && <p className="text-xs text-th-subtle truncate">{m.email}</p>}
            </div>

            {isAdmin && m.userId !== currentUserId ? (
              <RoleSelect
                value={m.role}
                disabled={loading === m.userId}
                onChange={role => handleRoleChange(m.userId, m.name, m.email, role)}
              />
            ) : (
              <Chip size="sm" color={ROLE_COLORS[m.role]} variant="flat" className="capitalize">
                {m.role}
              </Chip>
            )}

            {isAdmin && m.userId !== currentUserId && (
              <Button
                isIconOnly size="sm" variant="light" color="danger"
                isLoading={loading === m.userId}
                onPress={() => removeMember(m.userId)}
                aria-label="Remove member"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
