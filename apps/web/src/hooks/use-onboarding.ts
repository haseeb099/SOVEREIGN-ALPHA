"use client";

const STORAGE_KEY = "sovereign-onboarding-complete";

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function markOnboardingComplete(): void {
  localStorage.setItem(STORAGE_KEY, "true");
}

export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}
