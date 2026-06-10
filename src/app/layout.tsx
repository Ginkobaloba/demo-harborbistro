import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { DemoBanner } from "@/components/site/DemoBanner";
import { ParadigmBanner } from "@/components/site/ParadigmBanner";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  axes: ["SOFT", "WONK", "opsz"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Harbor Bistro | Coastal-inspired, locally sourced",
    template: "%s | Harbor Bistro",
  },
  description:
    "Coastal-inspired, locally sourced, weeknight-easy. Harbor Bistro serves upscale-casual coastal American food on the harborfront. Order online for pickup or delivery, or reserve a table.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} flex min-h-screen flex-col`}>
        <div className="flex-1">{children}</div>
        <DemoBanner />
        <ParadigmBanner />
      </body>
    </html>
  );
}
