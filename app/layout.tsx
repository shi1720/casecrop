import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://casecrop-shi1720.sg127977958.chatgpt.site'),
  title: 'CaseCrop — Less trace. Same bug.',
  description:
    'Shrink recorded executions into small, dependency-valid regression cases. A zero-dependency Python library with a live failure minimization lab.',
  openGraph: {
    title: 'CaseCrop — Less trace. Same bug.',
    description:
      'A wall of events. One reproducible bug. Try the Python failure minimization lab.',
    type: 'website',
  },
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
