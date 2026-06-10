"use client";

import { Button, Select, SelectItem, Switch } from "@heroui/react";
import { Field } from "@/components/ui/field";
import { Plus, Trash2, ChevronUp, ChevronDown, X, Share2 } from "lucide-react";

interface RefItem { id: string; name: string }

export interface FormStep {
  position: number;
  name: string;
  playbookId: string;
  inventoryId: string;
  dryRun: boolean;
  onFailure: "stop" | "continue";
  extraVars: { key: string; value: string }[];
  propagateVars: boolean;
}

interface Props {
  steps: FormStep[];
  playbooks: RefItem[];
  inventories: RefItem[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onUpdate: (idx: number, patch: Partial<FormStep>) => void;
}

export function WorkflowStepEditor({ steps, playbooks, inventories, onAdd, onRemove, onMove, onUpdate }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-th-primary">Steps</h3>
        <Button size="sm" variant="flat" startContent={<Plus className="h-3.5 w-3.5" />} onPress={onAdd}>
          Add Step
        </Button>
      </div>
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={idx} className="bg-card border border-border-base rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-th-muted w-6">#{idx + 1}</span>
              <Field
                label="Step name (optional)"
                value={step.name}
                onChange={e => onUpdate(idx, { name: e.target.value })}
                placeholder={`Step ${idx + 1}`}
                wrapperClassName="flex-1"
              />
              <div className="flex flex-col gap-0.5 pt-5">
                <button onClick={() => onMove(idx, -1)} disabled={idx === 0} className="text-th-subtle hover:text-th-primary disabled:opacity-30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onMove(idx, 1)} disabled={idx === steps.length - 1} className="text-th-subtle hover:text-th-primary disabled:opacity-30">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button isIconOnly size="sm" variant="light" color="danger" className="mt-5" isDisabled={steps.length === 1} onPress={() => onRemove(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-th-muted mb-1 block">Playbook</label>
                <Select
                  size="sm"
                  placeholder="Select playbook"
                  selectedKeys={step.playbookId ? [step.playbookId] : []}
                  onSelectionChange={keys => onUpdate(idx, { playbookId: Array.from(keys)[0] as string ?? "" })}
                  aria-label="Playbook"
                >
                  {playbooks.map(p => <SelectItem key={p.id}>{p.name}</SelectItem>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-th-muted mb-1 block">Inventory</label>
                <Select
                  size="sm"
                  placeholder="Select inventory"
                  selectedKeys={step.inventoryId ? [step.inventoryId] : []}
                  onSelectionChange={keys => onUpdate(idx, { inventoryId: Array.from(keys)[0] as string ?? "" })}
                  aria-label="Inventory"
                >
                  {inventories.map(i => <SelectItem key={i.id}>{i.name}</SelectItem>)}
                </Select>
              </div>
            </div>

            {/* Extra vars */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-th-muted">Extra vars</span>
                <button
                  type="button"
                  onClick={() => onUpdate(idx, { extraVars: [...step.extraVars, { key: "", value: "" }] })}
                  className="text-xs text-th-subtle hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add var
                </button>
              </div>
              {step.extraVars.map((v, vi) => (
                <div key={vi} className="flex items-center gap-1.5">
                  <input
                    value={v.key}
                    onChange={e => {
                      const updated = [...step.extraVars];
                      updated[vi] = { ...updated[vi], key: e.target.value };
                      onUpdate(idx, { extraVars: updated });
                    }}
                    placeholder="key"
                    className="w-28 rounded bg-input border border-border-base px-2 py-1 text-xs text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                  <span className="text-th-subtle text-xs">=</span>
                  <input
                    value={v.value}
                    onChange={e => {
                      const updated = [...step.extraVars];
                      updated[vi] = { ...updated[vi], value: e.target.value };
                      onUpdate(idx, { extraVars: updated });
                    }}
                    placeholder="value"
                    className="flex-1 rounded bg-input border border-border-base px-2 py-1 text-xs text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdate(idx, { extraVars: step.extraVars.filter((_, i) => i !== vi) })}
                    className="text-th-subtle hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch size="sm" isSelected={step.dryRun} onValueChange={v => onUpdate(idx, { dryRun: v })} color="warning" />
                <span className="text-xs text-th-muted">Dry run</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch size="sm" isSelected={step.onFailure === "continue"} onValueChange={v => onUpdate(idx, { onFailure: v ? "continue" : "stop" })} color="warning" />
                <span className="text-xs text-th-muted">Continue on failure</span>
              </div>
              {step.extraVars.length > 0 && idx < steps.length - 1 && (
                <div className="flex items-center gap-2">
                  <Switch size="sm" isSelected={step.propagateVars} onValueChange={v => onUpdate(idx, { propagateVars: v })} color="secondary" />
                  <span className="text-xs text-th-muted flex items-center gap-1">
                    <Share2 className="h-3 w-3" /> Pass vars to next steps
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
