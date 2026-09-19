/**
 * Explains the demo scope on the operator screens (D-016): the staff view is
 * open to try, but each browser sees only the sample records plus what it
 * entered itself.
 */
export function DemoScopeNote() {
  return (
    <p className="mt-4 rounded-xl border border-harbor-line bg-harbor-cream-deep/60 px-4 py-3 text-sm text-harbor-ink-soft">
      Demo view: you are seeing the sample orders and reservations plus
      anything you placed from this browser. Other visitors&rsquo; entries are
      never shown here, and visitor entries are deleted after 24 hours.
    </p>
  );
}
