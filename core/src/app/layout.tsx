import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Syne, Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { DesignVariantProvider } from '@/lib/designVariant';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains',
  display: 'swap',
});

// Syne — the "Living Room" display face for greetings / headline moments.
const syne = Syne({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
});

// Geist + Geist Mono — the "Chamber" design language (per docs/design-spec).
const geist = Geist({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-geist-mono',
  display: 'swap',
});

// Instrument Serif — italic emotional notes (the tutor's voice, quotes).
const instrumentSerif = Instrument_Serif({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduTutor — AI Language Tutor',
  description: 'AI-powered Slovak language tutoring with voice.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable} ${syne.variable} ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body className="antialiased">
        <AuthProvider>
          <ThemeProvider>
            <DesignVariantProvider>{children}</DesignVariantProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
