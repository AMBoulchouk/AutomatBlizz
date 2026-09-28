import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
});

export const metadata: Metadata = {
  title: 'AutomatBlizz — Automatización & Catálogo BlizzPaste',
  description:
    'Sistema automatizado de escaneo recursivo, catalogación y búsqueda de pastes de BlizzPaste con exportación masiva y persistencia local.',
  keywords: ['blizzpaste', 'automation', 'scraper', 'archivist', 'nextjs']
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
