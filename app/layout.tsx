import type {Metadata} from 'next';
import { Epilogue, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css'; // Global styles

const epilogue = Epilogue({
  subsets: ['latin'],
  variable: '--font-headline',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'HAPPY MOOD - Registro Diario',
  description: 'Tu diario de estado de ánimo diario.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className="dark">
      <body className={`${epilogue.variable} ${plusJakartaSans.variable} min-h-screen pb-24 md:pb-0 bg-surface text-on-surface`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
