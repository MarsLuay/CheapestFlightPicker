import { SnapshotFacts } from "./SnapshotFacts";
import { toHumanLabel } from "./utils";
import type { AdminUiSnapshot } from "./types";

export function FlightControlsView({
  adminSnapshot,
  searchProgress
}: {
  adminSnapshot?: AdminUiSnapshot;
  searchProgress?: { stage?: string; detail?: string | null; percent?: number } | null;
}) {
  const flightControlFacts = [
    {
      label: "Trip type",
      value: toHumanLabel(adminSnapshot?.route?.tripType)
    },
    {
      label: "Selected route",
      value: `${adminSnapshot?.route?.origin ?? "n/a"} -> ${
        adminSnapshot?.route?.destination || "(destination empty)"
      }`
    },
    {
      label: "Search Intelligence",
      value: String(adminSnapshot?.route?.searchIntelligence ?? "n/a")
    },
    {
      label: "Exact dates",
      value: adminSnapshot?.route?.useExactDates ? "enabled" : "flexible"
    },
    {
      label: "Departure range",
      value: adminSnapshot?.dateRanges?.departureRangeValid
        ? "valid"
        : "out of sync"
    },
    {
      label: "Return range",
      value: adminSnapshot?.dateRanges?.returnRangeValid ? "valid" : "out of sync"
    },
    {
      label: "Return locked to departure",
      value: adminSnapshot?.dateRanges?.returnDatesMatchDepartureRange ? "yes" : "no"
    },
    {
      label: "Search progress",
      value: searchProgress
        ? `${searchProgress.stage ?? "working"} (${searchProgress.percent ?? 0}%)`
        : "idle"
    }
  ];

  return (
    <section className="admin-card">
      <h3>Flight Controls</h3>
      <SnapshotFacts entries={flightControlFacts} />
      {searchProgress?.detail ? (
        <p className="muted-copy">{searchProgress.detail}</p>
      ) : null}
      {adminSnapshot?.searchState?.latestError ? (
        <p className="admin-status-copy">{adminSnapshot.searchState.latestError}</p>
      ) : null}
    </section>
  );
}
