"use client";

import dynamic from "next/dynamic";
import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function OrgSwitcherInner() {
  const { organization } = useOrganization();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const memberships = userMemberships?.data ?? [];
  if (memberships.length <= 1) {
    return organization ? (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Building2 className="size-3" />
        {organization.name}
      </span>
    ) : null;
  }

  return (
    <Select
      value={organization?.id ?? ""}
      onValueChange={(id) => setActive?.({ organization: id })}
    >
      <SelectTrigger className="h-7 w-[140px] text-[10px]">
        <SelectValue placeholder="Select org" />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.organization.id} value={m.organization.id}>
            {m.organization.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const OrgSwitcher = hasClerk
  ? dynamic(() => Promise.resolve(OrgSwitcherInner), { ssr: false })
  : () => null;
