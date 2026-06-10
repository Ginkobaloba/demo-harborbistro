// Placeholder home for the chunk 3.1 deploy. The full home page (hero
// photo, weekly menu preview, reservation CTA) is chunk 3.3.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-site flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <svg
        aria-hidden
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        className="text-harbor-coral"
      >
        <path
          d="M24 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 8v24M10 28c0 9 6.5 12 14 12s14-3 14-12M14 24l-4 4 4 4M34 24l4 4-4 4"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="text-5xl">Harbor Bistro</h1>
      <p className="max-w-md text-lg text-harbor-ink-soft">
        Coastal-inspired, locally sourced, weeknight-easy.
      </p>
      <p className="text-sm uppercase tracking-widest text-harbor-teal">
        Online ordering and reservations are docking soon
      </p>
    </main>
  );
}
