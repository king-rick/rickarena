import type { Metadata } from "next";
import { Rajdhani, Share_Tech_Mono, Press_Start_2P, Special_Elite } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-rajdhani",
});

const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-share-tech-mono",
});

const pressStart2P = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
});

const specialElite = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-special-elite",
});

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
    <html lang="en" className={`${rajdhani.variable} ${shareTechMono.variable} ${pressStart2P.variable} ${specialElite.variable}`}>
      <body className="bg-black">{children}</body>
    </html>
  );
}
