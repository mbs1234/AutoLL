/**
 * A section that starts folded away.
 *
 * For the reference material on a long screen -- what was learned, what
 * happened -- which is worth keeping and not worth scrolling past to reach
 * the controls underneath.
 *
 * Native `<details>`, so it needs no state, no JavaScript and no library:
 * the browser handles the toggle, keyboard access and the open/closed
 * semantics that a screen reader announces. `count` is rendered beside the
 * title so a folded section still says how much is inside.
 */
export default function Disclosure({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-4 border-t border-gray-200 pt-2">
      <summary className="cursor-pointer list-none font-semibold">
        {/* The marker is drawn here rather than left to the browser, whose
            default triangle is inconsistent across iOS and desktop and
            cannot be positioned. */}
        <span className="mr-1 inline-block text-gray-500 transition-transform">
          &#9656;
        </span>
        {title}
        {count !== undefined && (
          <span className="ml-1 font-normal text-gray-600">({count})</span>
        )}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}
