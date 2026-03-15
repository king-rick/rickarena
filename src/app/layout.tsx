import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RickArena",
  description: "Top-down co-op horde wave survival",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-black">{children}</body>
    </html>
  );
}
