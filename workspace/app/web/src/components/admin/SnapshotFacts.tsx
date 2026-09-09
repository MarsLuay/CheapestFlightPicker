export function SnapshotFacts({
  entries
}: {
  entries: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="admin-fact-list">
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}
