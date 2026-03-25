import type { TimeWindow } from "../lib/types";

type TimeRangeSliderProps = {
  label: string;
  value: TimeWindow;
  onChange: (value: TimeWindow) => void;
};

function formatHour(hour: number) {
  if (hour >= 24) {
    return "11:59 PM";
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized}:00 ${suffix}`;
}

export function TimeRangeSlider({
  label,
  value,
  onChange
}: TimeRangeSliderProps) {
  return (
    <div className="field filter-field slider-card">
      <span>{label}</span>
      <div className="time-window-label">
        <strong>{formatHour(value.from)}</strong>
        <span>to</span>
        <strong>{formatHour(value.to)}</strong>
      </div>
      <div className="range-stack">
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={value.from}
          onChange={(event) => {
            const nextFrom = Number.parseInt(event.target.value, 10);
            onChange({
              from: Math.min(nextFrom, value.to),
              to: value.to
            });
          }}
        />
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={value.to}
          onChange={(event) => {
            const nextTo = Number.parseInt(event.target.value, 10);
            onChange({
              from: value.from,
              to: Math.max(nextTo, value.from)
            });
          }}
        />
      </div>
    </div>
  );
}
