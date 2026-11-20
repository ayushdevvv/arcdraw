export default function ArcMark({ className = "" }) {
  return (
    <svg className={"arc-mark " + className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" />
      <path className="arc-mark-leg" d="M14 51 32 13 50 51" />
      <path className="arc-mark-bar" d="M19.5 41Q32 24 44.5 41" />
    </svg>
  );
}
