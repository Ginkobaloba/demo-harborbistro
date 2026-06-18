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

const SITE_URL = "https://harborbistro.projectnexuscode.org";
const SITE_DESCRIPTION =
  "Coastal-inspired, locally sourced, weeknight-easy. Harbor Bistro serves upscale-casual coastal American food on the harborfront. Order online for pickup or delivery, or reserve a table.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Harbor Bistro | Coastal-inspired, locally sourced",
    template: "%s | Harbor Bistro",
  },
  description: SITE_DESCRIPTION,
  robots: { index: false, follow: false },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Harbor Bistro",
    title: "Harbor Bistro",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Harbor Bistro, a Paradigm Coding Solutions portfolio demo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Harbor Bistro",
    description: SITE_DESCRIPTION,
    images: ["/og-default.png"],
  },
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
