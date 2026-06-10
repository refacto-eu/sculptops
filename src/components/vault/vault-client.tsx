"use client";

import { useState } from "react";
import { Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, TextareaField } from "@/components/ui/field";
import { Plus, Pencil, Trash2, Lock, Eye, EyeOff } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { formatDate } from "@/lib/utils";

interface VaultItem {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Props { initialVaultPasswords: VaultItem[]; role: "admin" | "member" | "viewer" }

const defaultForm = { name: "", description: "", password: "" };

export function VaultClient({ initialVaultPasswords, role }: Props) {
  const canWrite = role !== "viewer";
  const [items, setItems] = useState<VaultItem[]>(initialVaultPasswords);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setErrors({});
    setApiError(null);
    setShowPassword(false);
    setIsOpen(true);
  }

  function openEdit(item: VaultItem) {
    setEditingId(item.id);
    setForm({ name: item.name, description: item.description ?? "", password: "" });
    setErrors({});
    setApiError(null);
    setShowPassword(false);
    setIsOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!editingId && !form.password.trim()) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    setApiError(null);

    const payload: Record<string, string> = { name: form.name, description: form.description };
    if (form.password.trim()) payload.password = form.password;

    const url = editingId ? `/api/vault-passwords/${editingId}` : "/api/vault-passwords";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (res.ok) {
      const data = await res.json();
      setItems(prev => editingId ? prev.map(i => i.id === editingId ? { ...i, ...data } : i) : [data, ...prev]);
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/vault-passwords/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setItems(prev => prev.filter(i => i.id !== deleteId)); setDeleteId(null); }
  }

  return (
    <>
      {canWrite && (
        <div className="flex justify-end">
          <Button className="btn-primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
            New Vault Password
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="No vault passwords yet"
          description="Store encrypted Ansible Vault passwords and use them at execution time without exposing secrets."
          action={canWrite ? { label: "New Vault Password", onClick: openCreate } : undefined}
        />
      ) : (
        <div className="bg-card border border-border-base rounded-xl overflow-hidden">
          <Table removeWrapper aria-label="Vault Passwords" classNames={{ th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
            <TableHeader>
              <TableColumn>NAME</TableColumn>
              <TableColumn>DESCRIPTION</TableColumn>
              <TableColumn>PROVIDER</TableColumn>
              <TableColumn>CREATED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-th-muted text-sm">{item.description || "—"}</TableCell>
                  <TableCell>
                    <span className="text-xs bg-input px-2 py-0.5 rounded text-th-secondary capitalize">{item.provider}</span>
                  </TableCell>
                  <TableCell className="text-th-muted text-sm">{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canWrite && (
                        <Tip content="Edit" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" onPress={() => openEdit(item)} className="hover:!bg-zinc-500/15 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Tip>
                      )}
                      {canWrite && (
                        <Tip content="Delete" color="danger" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(item.id)} className="hover:!bg-red-500/15 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Tip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Info box */}
      {items.length > 0 && (
        <div className="rounded-lg bg-card border border-border-base p-4 text-sm text-th-muted space-y-1">
          <p className="text-th-secondary font-medium">How it works</p>
          <p>Select a vault password when running a playbook. SculptOps passes it via <code className="bg-input px-1 rounded text-xs">--vault-password-file</code> — the password is never exposed in logs or CLI arguments.</p>
          <p className="text-th-subtle text-xs mt-1">Passwords are encrypted at rest with AES-256-GCM using your <code className="bg-input px-1 rounded">ENCRYPTION_KEY</code>.</p>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit Vault Password" : "New Vault Password"}
        footer={
          <>
            <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
            <Button
              color="success"
              isLoading={loading}
              isDisabled={!form.name || (!editingId && !form.password)}
              onPress={handleSave}
            >
              {editingId ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError error={apiError} />
          <Field
            label="Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="production-vault"
            error={errors.name}
          />
          <Field
            label="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Vault password for production playbooks"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">
              {editingId ? "New password (leave empty to keep current)" : "Password *"}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editingId ? "Enter new password to rotate…" : "Your Ansible Vault password"}
                className={`w-full rounded-lg bg-input border px-3 py-2 pr-10 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 transition-colors ${
                  errors.password ? "border-red-500/70 focus:ring-red-500/50" : "border-border-base focus:ring-emerald-500/50"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-th-subtle hover:text-th-secondary transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
          </div>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Vault Password"
        size="sm"
        footer={
          <>
            <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
            <Button color="danger" onPress={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-th-secondary">
          This will permanently delete the vault password. Schedules and webhooks using it will no longer be able to decrypt vault-encrypted variables.
        </p>
      </Modal>
    </>
  );
}
