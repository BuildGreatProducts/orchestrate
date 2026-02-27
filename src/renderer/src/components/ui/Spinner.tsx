export default function Spinner({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M10 2a8 8 0 0 1 8 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
