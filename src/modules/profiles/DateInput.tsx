"use client";

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
  const year = value?.slice(0, 4) ?? "";
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
          <Input type="number" inputMode="numeric" aria-label={label} placeholder="Year" min={1800} max={2100} value={year}
            onChange={(e) => onChange(/^\d{4}$/.test(e.target.value) ? `${e.target.value}-01-01` : null, precision)} />
        )}
      </div>
    </div>
  );
}
