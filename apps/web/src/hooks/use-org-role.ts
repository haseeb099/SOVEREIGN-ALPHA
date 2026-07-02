"use client";

import { useAuth } from "@clerk/nextjs";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function useOrgRole() {
  const { orgRole } = useAuth();
  const role = (orgRole ?? "admin").replace("org:", "").toLowerCase();

  if (!hasClerk) {
    return { role: "admin", canWrite: true, isViewer: false };
  }

  return {
    role,
    canWrite: role === "admin" || role === "analyst",
    isViewer: role === "viewer",
  };
}

export function useOrgRoleLabel() {
  const { role } = useOrgRole();
  return role;
}
