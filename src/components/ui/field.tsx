"use client";

import { forwardRef, TextareaHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
  minRows?: number;
}

const inputBase =
  "w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors";

const inputError =
  "border-red-500/70 focus:ring-red-500/50 focus:border-red-500/70";

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, wrapperClassName, className, id, error, ...props }, ref) => {
    const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        <label htmlFor={fieldId} className="text-sm font-medium text-th-secondary">
          {label}
        </label>
        <input
          id={fieldId}
          ref={ref}
          className={cn(inputBase, error && inputError, className)}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
Field.displayName = "Field";

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, wrapperClassName, className, minRows = 3, id, error, ...props }, ref) => {
    const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        <label htmlFor={fieldId} className="text-sm font-medium text-th-secondary">
          {label}
        </label>
        <textarea
          id={fieldId}
          ref={ref}
          rows={minRows}
          className={cn(inputBase, "resize-none", error && inputError, className)}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
TextareaField.displayName = "TextareaField";

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function SelectField({ label, value, onChange, error, children, className }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-th-secondary">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(inputBase, error && inputError, className)}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
