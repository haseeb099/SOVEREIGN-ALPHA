"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

/** Bloomberg-terminal amber — matches globals.css --primary */
export const BRAND_PRIMARY = "#e5a00d";

export type OrgBranding = {
  firm_name: string;
  product_name: string;
  primary_color: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  disclaimer?: string;
};

const DEFAULT_BRANDING: OrgBranding = {
  firm_name: "Sovereign-Alpha",
  product_name: "Sovereign-Alpha",
  primary_color: BRAND_PRIMARY,
  favicon_url: "/favicon.svg",
  disclaimer: "Not investment advice.",
};

const BrandingContext = createContext<OrgBranding>(DEFAULT_BRANDING);

function applyPrimaryColor(color: string) {
  document.documentElement.style.setProperty("--primary", color);
  document.documentElement.style.setProperty("--ring", `${color}99`);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<OrgBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    applyPrimaryColor(BRAND_PRIMARY);
    apiFetch<OrgBranding>("/api/org/branding")
      .then((data) => {
        const merged = { ...DEFAULT_BRANDING, ...data };
        const color =
          !data.primary_color || data.primary_color === "#3b82f6"
            ? BRAND_PRIMARY
            : data.primary_color;
        merged.primary_color = color;
        setBranding(merged);
        applyPrimaryColor(color);
      })
      .catch(() => {
        setBranding(DEFAULT_BRANDING);
        applyPrimaryColor(BRAND_PRIMARY);
      });
  }, []);

  return (
    <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
