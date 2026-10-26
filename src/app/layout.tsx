import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pawang AI — Real-Time Flood Prediction & Water Intelligence',
  description:
    'Advanced real-time flood forecasting, GIS water intelligence, and commuter early warning platform inspired by NOAA Water Prediction Service.',
  keywords: [
    'Pawang AI',
    'Flood Prediction Jakarta',
    'Banjir Jabodetabek',
    'Real-time Hydrology',
    'NOAA GIS Map',
    'Early Warning System',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${inter.variable} h-full antialiased dark`}>
      <body className="h-full w-full overflow-hidden flex flex-col font-sans select-none">
        {children}
      </body>
    </html>
  );
}
