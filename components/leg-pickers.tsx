"use client";

import { useState } from "react";
import { marketsForSport, matchOption } from "@/lib/client/leg-entry";
import { COMMON_SPORTS, sportChoices } from "@/lib/client/slip";

const OTHER = "__other__";

interface PickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  otherPlaceholder: string;
  describedBy?: string;
  invalid?: boolean;
}

/**
 * A dropdown of familiar choices with "Other" for anything else. A native select, so phones show
 * their own easy picker. A value that is not in the list (typed earlier, or saved on an old bet)
 * is kept and shown in the Other box rather than lost.
 */
function Picker({ id, label, value, onChange, options, placeholder, otherPlaceholder, describedBy, invalid }: PickerProps) {
  const listed = matchOption(value, options);
  const [other, setOther] = useState(false);
  const showOther = other || (value.trim() !== "" && listed === null);
  const selectValue = showOther ? OTHER : (listed ?? "");

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER) {
            setOther(true);
            if (listed !== null) onChange("");
          } else {
            setOther(false);
            onChange(next);
          }
        }}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {showOther ? (
        <input className="input" aria-label={`${label}, other`} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={otherPlaceholder} />
      ) : null}
    </div>
  );
}

export function SportPicker({
  id,
  label = "Sport",
  value,
  onChange,
  favorites,
  quick = [],
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  favorites: readonly string[];
  /** One-tap switches, for example the sports already on the slip. */
  quick?: readonly string[];
}) {
  const options = sportChoices(favorites);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Picker id={id} label={label} value={value} onChange={onChange} options={options.length > 0 ? options : COMMON_SPORTS} placeholder="Choose a sport" otherPlaceholder="Type the sport" />
      {quick.length > 1 ? (
        <ul className="tag-list" aria-label="Quick sport switch">
          {quick.map((s) => (
            <li key={s}>
              <button type="button" className="tab" aria-pressed={value.trim().toLowerCase() === s.toLowerCase()} onClick={() => onChange(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MarketPicker({ id, label = "Market", value, onChange, sport }: { id: string; label?: string; value: string; onChange: (value: string) => void; sport: string }) {
  return <Picker id={id} label={label} value={value} onChange={onChange} options={marketsForSport(sport)} placeholder="Choose a market" otherPlaceholder="Type the market" />;
}
