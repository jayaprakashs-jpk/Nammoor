"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Small set of form parts. Big tap targets (48px) for budget phones.

const base =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-white/20 dark:bg-stone-900";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs opacity-60">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={`${base} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${base} ${props.className ?? ""}`} />;
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white",
  secondary: "border border-black/15 dark:border-white/20",
  danger: "border border-red-600 text-red-700 dark:text-red-400",
  ghost: "text-brand",
};

export function Button({
  variant = "primary",
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`min-h-12 rounded-lg px-4 py-3 font-medium active:scale-[0.98] disabled:opacity-50 ${variants[variant]} ${props.className ?? ""}`}
    >
      {busy ? "Please wait..." : children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {children}
    </p>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/15">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
