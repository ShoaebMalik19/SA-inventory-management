import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "S.A Computers — Stock",
  description: "Stock, checking and sales for S.A Computers, RT Nagar.",
  appleWebApp: { capable: true, title: "S.A Stock", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a3d34",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className="h-full antialiased">
      <body className="min-h-full">
        {/* the app reads the address bar (current page, invoice id) in the browser */}
        <Suspense>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
