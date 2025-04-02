"use client";

import * as React from "react";
import { NavMain, type NavMainItem } from "@/src/components/nav/nav-main";
import {
  NavUser,
  type UserNavigationProps,
} from "@/src/components/nav/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/src/components/ui/sidebar";
import { env } from "@/src/env.mjs";
import { useRouter } from "next/router";
import Link from "next/link";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { LangfuseLogo } from "@/src/components/LangfuseLogo";
import { BalanceSection } from "@/src/features/public-api/components/BalanceSection";

type AppSidebarProps = {
  navItems: NavMainItem[];
  secondaryNavItems: NavMainItem[];
  userNavProps: UserNavigationProps;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  navItems,
  secondaryNavItems,
  userNavProps,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <div className="flex min-h-10 items-center gap-2 px-3 py-2">
          <LangfuseLogo version />
        </div>
        <div className="h-1 flex-1 border-b" />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <div className="flex-1" />
        <NavMain items={secondaryNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <BalanceSection />
        <NavUser {...userNavProps} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
