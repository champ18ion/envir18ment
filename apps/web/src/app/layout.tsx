import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const aeonik = localFont({
  variable: "--font-heading",
  src: [
    { path: "../../public/fonts/fonnts.com-Aeonik_Light.ttf",   weight: "300" },
    { path: "../../public/fonts/fonnts.com-Aeonik_Regular.ttf", weight: "400" },
    { path: "../../public/fonts/fonnts.com-Aeonik_Bold.ttf",    weight: "700" },
    { path: "../../public/fonts/fonnts.com-Aeonik_Black.ttf",   weight: "900" },
  ],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "envir18ment",
  description: "Secure env management for teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${aeonik.variable} ${ibmPlexMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
