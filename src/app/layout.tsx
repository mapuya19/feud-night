import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Keep the existing typefaces local: clean builds must not depend on Google
// Fonts requests or remote CSS parsing. Licenses/sources live in ./fonts/.
const outfit = localFont({
  src: "./fonts/outfit-latin-variable.woff2",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const title = "Feud Night — Family Feud-style party game";
const description =
  "A Family Feud-style party game: 2–5 teams, phones as controllers, TV as the board, up to 40 players. Survey says.";

export const metadata: Metadata = {
  title: { default: title, template: "%s · Feud Night" },
  description,
  applicationName: "Feud Night",
  openGraph: { title, description, type: "website", siteName: "Feud Night" },
};

export const viewport: Viewport = {
  themeColor: "#0c0f1d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
