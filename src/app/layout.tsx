import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feud Night",
  description: "A 3-team Family Feud-style party game for your apartment. Phones are controllers, TV is the board.",
};

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ink antialiased">{children}</body>
    </html>
  );
}
