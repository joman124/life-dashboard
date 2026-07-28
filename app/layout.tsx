import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Life Dashboard',
  description: 'A personal command center for the metrics that matter.',
  // iOS ignores the web manifest's icons and reads this link instead.
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: {
    capable: true, // launch standalone from the home screen, without Safari chrome
    title: 'Life',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E0C08',
  // Fill the notch area on iPhone so the dark background runs edge to edge.
  // Pinch-zoom is deliberately left enabled — blocking it fails WCAG 1.4.4,
  // and this screen is full of small numbers.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
