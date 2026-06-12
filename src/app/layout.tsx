import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { DemoBanner } from "@/components/site/DemoBanner";
import { ParadigmBanner } from "@/components/site/ParadigmBanner";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
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
        <CartProvider>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
          <DemoBanner />
          <ParadigmBanner />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
