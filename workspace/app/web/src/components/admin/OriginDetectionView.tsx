import { SnapshotFacts } from "./SnapshotFacts";
import { toHumanLabel } from "./utils";
import type { AdminUiSnapshot } from "./types";

export function OriginDetectionView({
  locationDetection
}: {
  locationDetection?: AdminUiSnapshot["locationDetection"];
}) {
  const originDetectionFacts = [
    {
      label: "Detection status",
      value: toHumanLabel(locationDetection?.status)
    },
    {
      label: "Selection source",
      value: toHumanLabel(locationDetection?.selectionSource)
    },
    {
      label: "Applied origin",
      value: locationDetection?.appliedOrigin ?? "n/a"
    },
    {
      label: "Inferred airport",
      value: locationDetection?.inferredAirport ?? "n/a"
    },
    {
      label: "Browser time zone",
      value: locationDetection?.browserTimeZone ?? "n/a"
    },
    {
      label: "Matched region",
      value: locationDetection?.matchedRegion ?? "n/a"
    },
    {
      label: "Fallback origin",
      value: locationDetection?.fallbackOrigin ?? "n/a"
    }
  ];

  return (
    <section className="admin-card">
      <h3>Origin Detection</h3>
      <SnapshotFacts entries={originDetectionFacts} />
      <p className="muted-copy">
        {locationDetection?.message ?? "No origin-detection status has been recorded yet."}
      </p>
    </section>
  );
}
