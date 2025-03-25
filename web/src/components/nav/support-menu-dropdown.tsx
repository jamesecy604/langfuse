import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  ArrowUpRight,
  Bug,
  Github,
  LibraryBig,
  LifeBuoy,
  Lightbulb,
  MessageCircle,
  MessageSquarePlus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import {
  chatAvailable,
  chatIsVisible,
  showChat,
  hideChat,
} from "@/src/features/support-chat/chat";
import { Switch } from "@/src/components/ui/switch";
import { SiDiscord } from "react-icons/si";

type SupportMenuItem = {
  title: string;
  pathname: string;
  icon: LucideIcon | React.ElementType;
  menuNode?: ReactNode;
};

export const SupportMenuDropdown = () => {
  const supportMenuItems: (SupportMenuItem | "separator")[] = useMemo(() => {
    const items: (SupportMenuItem | "separator")[] = [
      {
        title: "Ask AI",
        pathname: "https://langfuse.com/docs/ask-ai",
        icon: Sparkles,
      },
    ];

    const chatVisible = chatIsVisible();

    items.push("separator");

    items.push("separator");

    return items;
  }, []);

  const { isMobile } = useSidebar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton>
          <LifeBuoy className="h-4 w-4" />
          Support
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        {supportMenuItems.map((item, index) => {
          if (item === "separator") {
            return <DropdownMenuSeparator key={`separator-${index}`} />;
          }
          const url = item.pathname;
          return (
            <DropdownMenuItem key={item.title} asChild>
              {item.menuNode ?? (
                <a
                  href={url}
                  target={url.startsWith("http") ? "_blank" : undefined}
                  rel={url.startsWith("http") ? "noopener" : undefined}
                  className="flex cursor-pointer items-center"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.title}
                  {url.startsWith("http") && (
                    <ArrowUpRight className="ml-1 h-3 w-3" />
                  )}
                </a>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
