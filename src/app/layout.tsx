import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/providers'
import { AtmosphericBackground } from '@/components/layout/atmospheric-background'
import { AppShell } from '@/components/layout/app-shell'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Plately',
  description: 'Scan food, recipes, and menus — get ingredients and macros instantly.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Plately',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased" data-theme="dark">
      <body className="min-h-full flex flex-col">
        {/* AtmosphericBackground is outside #main-content — CSS transform on
            #main-content (BottomSheet open) would break fixed positioning if
            placed inside. See globals.css #main-content transform rule. */}
        <AtmosphericBackground />
        <div id="main-content" className="flex flex-col flex-1 min-h-full">
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </div>
        <Toaster />
      </body>
    </html>
  )
}
