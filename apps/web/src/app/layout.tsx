import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { DisclaimerFooter } from "@/components/layout/disclaimer-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sovereign-Alpha",
    template: "%s | Sovereign-Alpha",
  },
  description: "AI Investment Intelligence OS — thesis tracking, scenario modeling, and portfolio copilot.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Sovereign-Alpha",
    description: "AI Investment Intelligence OS",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh antialiased font-sans">
        <AuthProvider>
          {children}
          <DisclaimerFooter />
        </AuthProvider>
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  );
}
