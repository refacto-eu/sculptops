"use client";

import { useEffect, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";
}

const sizeClasses = {
  sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg",
  xl: "max-w-xl", "2xl": "max-w-2xl", "4xl": "max-w-4xl",
};

export function Modal({ isOpen, onClose, title, children, footer, size = "lg" }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        "relative w-full bg-card border border-border-strong rounded-xl shadow-2xl flex flex-col max-h-[90vh]",
        sizeClasses[size]
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
          <h2 className="text-base font-semibold text-th-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-th-muted hover:text-th-primary transition-colors rounded-md p-1 hover:bg-input"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border-base shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
