export default function ArcMark({ className = "" }) {
  return (
    <svg className={`arc-mark ${className}`} viewBox="0 0 44 44" aria-hidden="true">
      <rect x="1" y="1" width="42" height="42" rx="13" fill="currentColor" />
      <path d="M9.5 30.5 19.2 11h5.6l9.7 19.5h-6l-2.1-4.6H17.6l-2.1 4.6h-6Zm10.4-9.1h4.2L22 16.8l-2.1 5.4Z" fill="#f6f6f2" />
    </svg>
  );
}
