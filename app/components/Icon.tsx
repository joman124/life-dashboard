import type { CSSProperties } from 'react';
export type IconName =
  'today' | 'week' | 'trends' | 'streaks' | 'track' | 'bell' | 'plus' | 'arrow' | 'check' | 'close';
const paths: Record<IconName, React.ReactNode> = {
  today: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="4" />
      <path d="M8 3v4m8-4v4M4 11h16m-11 5 2 2 4-4" />
    </>
  ),
  week: (
    <>
      <path d="M4 20h16M6 16v-5m6 5V5m6 11V8" />
    </>
  ),
  trends: (
    <>
      <path d="M4 18 10 12l4 3 6-10m-5 0h5v5" />
    </>
  ),
  streaks: (
    <path d="M13 3c1 5-4 6-2 10 1-2 3-2 4-5 3 3 4 5 4 8a7 7 0 0 1-14 0c0-4 3-6 3-6s-1 4 2 5c-3-6 3-8 3-12Z" />
  ),
  track: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="15" cy="17" r="3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 12h6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
