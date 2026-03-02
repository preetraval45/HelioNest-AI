import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: {
    default: "HelioNest AI — Property Climate Intelligence",
    template: "%s | HelioNest AI",
  },
  description:
    "Enter any U.S. address and get hyper-detailed solar, weather, and environmental insights powered by AI.",
  keywords: ["solar", "weather", "property", "climate", "AI", "sun path", "energy"],
  openGraph: {
    title: "HelioNest AI",
    description: "AI-Powered Property Climate Intelligence Platform",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
