/**
 * Short notice on every form that collects visitor details (D-016). Visitor
 * entries are scoped to the visitor's own browser and deleted after 24
 * hours, but the safest data is data nobody types in.
 */
export const DEMO_DATA_NOTICE =
  "This is a demo. Please don't enter real personal details.";

export function DemoDataNotice({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      data-testid="demo-data-notice"
      className={`rounded-lg border border-harbor-coral/40 bg-white px-3 py-2 text-sm text-harbor-ink ${className}`}
    >
      {DEMO_DATA_NOTICE}
    </p>
  );
}
