export function PageOrnaments() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Corner className="absolute -left-3 top-28 hidden h-64 w-24 text-burgundy lg:block" />
      <Corner className="absolute -right-3 bottom-16 hidden h-56 w-24 rotate-180 text-burgundy lg:block" />
    </div>
  );
}

export function Flourish({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 8h48M124 8h48M90 8c-8 0-10-6-16-6s-8 6-16 6 10 6 16 6 8-6 16-6zm0 0c8 0 10-6 16-6s8 6 16 6-10 6-16 6-8-6-16-6z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path d="M90 3.5l2.2 4.5-2.2 4.5-2.2-4.5 2.2-4.5z" fill="currentColor" />
    </svg>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 90 240" className={className} fill="none">
      <path d="M78 12c-28 0-50 24-50 58v158" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M66 28c-18 0-32 16-32 40v140" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M46 86l10 16-10 16-10-16 10-16z" stroke="#C6A15B" strokeWidth="0.9" />
      <path d="M46 118v46M34 132h24" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
    </svg>
  );
}
