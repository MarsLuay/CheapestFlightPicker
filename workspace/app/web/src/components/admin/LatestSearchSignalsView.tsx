import { SnapshotFacts } from "./SnapshotFacts";
import { toHumanLabel } from "./utils";
import type { AdminUiSnapshot } from "./types";

export function LatestSearchSignalsView({
  latestSummary
}: {
  latestSummary?: AdminUiSnapshot["latestSummary"];
}) {
  const latestSignalFacts = [
    {
      label: "Cheapest overall",
      value: latestSummary?.cheapestOverall?.price ?? "n/a"
    },
    {
      label: "Round-trip best",
      value: latestSummary?.cheapestRoundTrip ?? "n/a"
    },
    {
      label: "Best two one-ways",
      value: latestSummary?.cheapestTwoOneWays ?? "n/a"
    },
    {
      label: "Timing guidance",
      value: latestSummary?.timingGuidance
        ? `${toHumanLabel(latestSummary.timingGuidance.recommendation)} (${toHumanLabel(
            latestSummary.timingGuidance.confidence
          )})`
        : "none"
    },
    {
      label: "Price alert",
      value: latestSummary?.priceAlert
        ? `${toHumanLabel(latestSummary.priceAlert.kind)}${
            typeof latestSummary.priceAlert.changePercent === "number"
              ? ` (${latestSummary.priceAlert.changePercent}%)`
              : ""
          }`
        : "none"
    },
    {
      label: "Separate one-ways",
      value: latestSummary?.separateOneWayInsight
        ? "lower than round-trip"
        : "none"
    },
    {
      label: "Date pairs evaluated",
      value: String(latestSummary?.evaluatedDatePairs ?? 0)
    },
    {
      label: "Options inspected",
      value: String(latestSummary?.inspectedOptions ?? 0)
    }
  ];

  return (
    <section className="admin-card">
      <h3>Latest Search Signals</h3>
      <SnapshotFacts entries={latestSignalFacts} />
      {latestSummary?.timingGuidance?.summary ? (
        <p className="muted-copy">{latestSummary.timingGuidance.summary}</p>
      ) : null}
      {latestSummary?.priceAlert?.summary ? (
        <p className="muted-copy">{latestSummary.priceAlert.summary}</p>
      ) : null}
      {latestSummary?.separateOneWayInsight?.summary ? (
        <p className="muted-copy">{latestSummary.separateOneWayInsight.summary}</p>
      ) : null}
    </section>
  );
}
