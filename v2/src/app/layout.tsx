import type { Metadata, Viewport } from "next";
// Fonts loaded via @fontsource (self-hosted, no network fetch at build time)
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/dm-sans/300.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { InstallPromptBanner } from "@/components/pwa/InstallPromptBanner";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Plately",
  description: "Take home the food you love.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Plately",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Terracotta accent matches manifest theme_color and meta theme-color below
  themeColor: "#C4622D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* PWA: explicit theme-color for browsers that read it from the <head> directly */}
        <meta name="theme-color" content="#C4622D" />
        {/* Apple-specific PWA meta — Next.js appleWebApp in metadata handles most,
            but these are required for full-screen mode on older iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="h-full antialiased">
        {/* Service worker registration (client-only, renders null) */}
        <ServiceWorkerRegistrar />
        <Providers>
          {children}
          {/* PWA install prompt banner — floats above content, respects dismissed state */}
          <InstallPromptBanner />
        </Providers>
      </body>
    </html>
  );
}
