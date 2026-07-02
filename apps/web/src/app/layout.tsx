import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { BrandingProvider } from "@/providers/branding-provider";
import { DisclaimerFooter } from "@/components/layout/disclaimer-footer";
import "./globals.css";

const ibmSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

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
    <html lang="en" className={`dark ${ibmSans.variable} ${ibmMono.variable}`}>
      <body className="min-h-dvh antialiased font-sans">
        <AuthProvider>
          <BrandingProvider>
            {children}
            <DisclaimerFooter />
          </BrandingProvider>
        </AuthProvider>
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  );
}
