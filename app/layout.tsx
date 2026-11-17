import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solar PV Monitor",
  description: "Live fault and dust detection for a solar panel - IEEE Mzuzu University Student Club",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Applies the saved theme (ThemeToggle) before the first paint, so there is no flash
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("pv-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
