import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const title = "Feud Night — 4-team apartment Family Feud";
const description =
  "A Family Feud-style party game for your apartment: 4 teams, phones as controllers, TV as the board. Survey says.";

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
