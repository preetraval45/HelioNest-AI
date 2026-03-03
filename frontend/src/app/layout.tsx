import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { PostHogProvider } from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: {
    default: "HelioNest AI — Property Climate Intelligence",
    template: "%s | HelioNest AI",
  },
  description:
    "Enter any U.S. address and get hyper-detailed solar, weather, and environmental insights powered by AI.",
  keywords: ["solar", "weather", "property", "climate", "AI", "sun path", "energy"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HelioNest",
  },
  openGraph: {
    title: "HelioNest AI",
    description: "AI-Powered Property Climate Intelligence Platform",
    type: "website",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/*
          Anti-flash inline script: reads localStorage BEFORE first paint.
          Sets the correct dark/light class so there is no color flash on load.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hn-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {/* PostHog needs useSearchParams → must be wrapped in Suspense */}
          <Suspense fallback={null}>
            <PostHogProvider>
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
              >
                Skip to main content
              </a>
              <main id="main-content">
                {children}
              </main>
              <PWAInstallPrompt />
            </PostHogProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
