"use client";

import { useState } from "react";
import type { Enums } from "@/shared/lib/supabase";
import { Input, Select } from "@/shared/ui/form";

type Precision = Enums<"date_precision_t">;

// Many elders only know the year. Let people say exactly what they know.
export function DateInput({
  value,
  precision,
  onChange,
  label,
}: {
  value: string | null;
  precision: Precision;
  onChange: (value: string | null, precision: Precision) => void;
  label: string;
}) {
  const month = value?.slice(0, 7) ?? "";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        <Select
          aria-label={`${label} known as`}
          value={precision}
          className="!w-36"
          onChange={(e) => {
            const p = e.target.value as Precision;
            onChange(p === "unknown" ? null : value, p);
          }}
        >
          <option value="unknown">Unknown</option>
          <option value="exact">Exact date</option>
          <option value="month">Month + year</option>
          <option value="year">Year only</option>
          <option value="approx">About (year)</option>
        </Select>
        {precision === "exact" && (
          <Input type="date" aria-label={label} value={value ?? ""} max="2100-12-31"
            onChange={(e) => onChange(e.target.value || null, precision)} />
        )}
        {precision === "month" && (
          <Input type="month" aria-label={label} value={month}
            onChange={(e) => onChange(e.target.value ? `${e.target.value}-01` : null, precision)} />
        )}
        {(precision === "year" || precision === "approx") && (
          <YearField key={precision} label={label} initial={value?.slice(0, 4) ?? ""}
            onYear={(y) => onChange(y ? `${y}-01-01` : null, precision)} />
        )}
      </div>
    </div>
  );
}

/**
 * Keeps what the person is typing in its own text. The saved date stays empty
 * until all 4 digits are in, so showing the saved date here would wipe the box
 * after the first key.
 */
function YearField({ label, initial, onYear }: { label: string; initial: string; onYear: (year: string | null) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      autoComplete="off"
      aria-label={label}
      placeholder="Year, e.g. 1950"
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
        setText(digits);
        const n = Number(digits);
        onYear(digits.length === 4 && n >= 1800 && n <= 2100 ? digits : null);
      }}
    />
  );
}
