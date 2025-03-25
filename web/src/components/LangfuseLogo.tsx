import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { VersionLabel } from "./VersionLabel";
import { env } from "@/src/env.mjs";
import { PlusIcon } from "lucide-react";

export const LangfuseIcon = ({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`}
    width={size}
    height={size}
    alt="Langfuse Icon"
    className={className}
  />
);

const LangfuseLogotypeOrCustomized = ({ size }: { size: "sm" | "xl" }) => {
  return (
    <div className="flex items-center">
      <LangfuseIcon size={size === "sm" ? 16 : 20} />
      <span
        className={cn(
          "ml-2 font-mono font-semibold leading-none group-data-[collapsible=icon]:hidden",
          size === "sm" ? "text-sm" : "text-xl",
        )}
      >
        Langfuse
      </span>
    </div>
  );
};

export const LangfuseLogo = ({
  className,
  size = "sm",
  version = false,
}: {
  size?: "sm" | "xl";
  className?: string;
  version?: boolean;
}) => {
  return (
    <div
      className={cn(
        "-mt-2 ml-1 flex flex-wrap gap-4 lg:flex-col lg:items-start",
        className,
      )}
    >
      {/* Langfuse Logo */}
      <div className="flex items-center">
        <Link href="/" className="flex items-center">
          <LangfuseLogotypeOrCustomized size={size} />
        </Link>
        {version && (
          <VersionLabel className="ml-2 group-data-[collapsible=icon]:hidden" />
        )}
      </div>
    </div>
  );
};
