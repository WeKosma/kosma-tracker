import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { UiProvider } from "@/components/ui";
import "./globals.css";

const kosma = localFont({
  src: "./fonts/kosma-display-extralight.woff2",
  weight: "200",
  variable: "--font-kosma",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "KOSMA Tracker", template: "%s · KOSMA Tracker" },
  description: "Seguimiento de leads, clientes y propuestas de KOSMA.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#050505" };

const themeScript = `try{var t=localStorage.getItem('kosma-theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={kosma.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <UiProvider>{children}</UiProvider>
      </body>
    </html>
  );
}
