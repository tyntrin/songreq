"use client";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-[60px] shrink-0 items-center justify-center disabled:opacity-60"
    >
      <span className={`relative h-[30px] w-[52px] rounded-full transition-colors ${checked ? "bg-accent" : "bg-line-strong"}`}>
        <span
          className={`absolute top-[3px] h-6 w-6 rounded-full transition-all ${
            checked ? "left-[25px] bg-on-accent" : "left-[3px] bg-ink"
          }`}
        />
      </span>
    </button>
  );
}
