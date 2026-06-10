// Site-wide disclaimer required by the demo spec. Sits directly above the
// Paradigm attribution banner, styled in Harbor Bistro's own brand.
export function DemoBanner() {
  return (
    <div className="border-t border-harbor-line bg-harbor-cream-deep px-4 py-2 text-center text-sm text-harbor-ink-soft">
      Demo site -- orders and reservations are not real. Don&apos;t drive here
      looking for dinner.
    </div>
  );
}
