import dynamic from "next/dynamic";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import { useQueryProject } from "@/src/features/projects/hooks";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { PostHogLogo } from "@/src/components/PosthogLogo";
import { Card } from "@/src/components/ui/card";

// Dynamic imports with loading states
const GeneralSettings = dynamic(
  () =>
    import("@/src/pages/project/[projectId]/settings/GeneralSettings").then(
      (mod) => mod.GeneralSettings,
    ),
  {
    loading: () => <div>Loading settings...</div>,
    ssr: false,
  },
);

const ApiKeyListUser = dynamic(
  () =>
    import("@/src/features/public-api/components/ApiKeyListUser").then(
      (mod) => mod.ApiKeyListUser,
    ),
  {
    loading: () => <div>Loading API keys...</div>,
    ssr: false,
  },
);

const LlmApiKeyList = dynamic(
  () =>
    import("@/src/features/public-api/components/LLMApiKeyList").then(
      (mod) => mod.LlmApiKeyList,
    ),
  {
    loading: () => <div>Loading LLM connections...</div>,
    ssr: false,
  },
);

const CostUsagePage = dynamic(
  () =>
    import("@/src/pages/project/[projectId]/cost-usage").then(
      (mod) => mod.default,
    ),
  {
    loading: () => <div>Loading cost data...</div>,
    ssr: false,
  },
);

const ModelsSettings = dynamic(
  () =>
    import("@/src/features/models/components/ModelSettings").then(
      (mod) => mod.ModelsSettings,
    ),
  {
    loading: () => <div>Loading models...</div>,
    ssr: false,
  },
);

const MembersTable = dynamic(
  () =>
    import("@/src/features/rbac/components/MembersTable").then(
      (mod) => mod.MembersTable,
    ),
  {
    loading: () => <div>Loading members...</div>,
    ssr: false,
  },
);

const MembershipInvitesPage = dynamic(
  () =>
    import("@/src/features/rbac/components/MembershipInvitesPage").then(
      (mod) => mod.MembershipInvitesPage,
    ),
  {
    loading: () => <div>Loading invites...</div>,
    ssr: false,
  },
);
import {
  useEntitlements,
  useHasEntitlement,
} from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { ActionButton } from "@/src/components/ActionButton";
import { BatchExportsSettingsPage } from "@/src/features/batch-exports/components/BatchExportsSettingsPage";
import { memo } from "react";
const ConfigureRetention = memo(
  dynamic(
    () => import("@/src/features/projects/components/ConfigureRetention"),
    {
      loading: () => <div>Loading retention settings...</div>,
      ssr: false,
    },
  ),
);
import ContainerPage from "@/src/components/layouts/container-page";
import React, { useMemo } from "react";

type ProjectSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useProjectSettingsPages(): ProjectSettingsPage[] {
  const router = useRouter();
  const { project, organization } = useQueryProject();

  // Move hooks outside of useMemo
  const showBillingSettings = useHasEntitlement("cloud-billing");
  const showRetentionSettings = useHasEntitlement("data-retention");

  // Memoize only the derived values
  const entitlements = useMemo(
    () => ({
      showBillingSettings,
      showRetentionSettings,
    }),
    [showBillingSettings, showRetentionSettings],
  );

  // Memoize the pages computation with more specific dependencies
  return useMemo(() => {
    if (!project?.id || !organization?.id || !router.query.projectId) {
      return [];
    }

    // Simplified LLM connections check
    const showLLMConnectionsSettings = true;

    return getProjectSettingsPages({
      project,
      organization,
      showBillingSettings: entitlements.showBillingSettings,
      showRetentionSettings: entitlements.showRetentionSettings,
      showLLMConnectionsSettings,
    });
  }, [
    project?.id,
    organization?.id,
    router.query.projectId,
    entitlements.showBillingSettings,
    entitlements.showRetentionSettings,
  ]);
}

// Pure function to generate settings pages
export function getProjectSettingsPages({
  project,
  organization,
  showBillingSettings,
  showRetentionSettings,
  showLLMConnectionsSettings,
}: {
  project: { id: string; name: string };
  organization: { id: string; name: string };
  showBillingSettings: boolean;
  showRetentionSettings: boolean;
  showLLMConnectionsSettings: boolean;
}): ProjectSettingsPage[] {
  return [
    {
      title: "General",
      slug: "index",
      cmdKKeywords: ["name", "id", "delete", "transfer", "ownership"],
      content: (
        <GeneralSettings
          project={project}
          organization={organization}
          showRetentionSettings={showRetentionSettings}
        />
      ),
    },
    // {
    //   title: "Project API Keys",
    //   slug: "api-keys",
    //   cmdKKeywords: ["auth", "public key", "secret key"],
    //   content: (
    //     <div className="flex flex-col gap-6">
    //       <ApiKeyList projectId={project.id} />
    //     </div>
    //   ),
    // },
    {
      title: "My API Keys",
      slug: "user-api-keys",
      cmdKKeywords: ["auth", "public key", "secret key", "personal"],
      content: (
        <div className="flex flex-col gap-6">
          <ApiKeyListUser projectId={project.id} />
        </div>
      ),
    },
    {
      title: "LLM Connections",
      slug: "llm-connections",
      cmdKKeywords: [
        "llm",
        "provider",
        "openai",
        "anthropic",
        "azure",
        "playground",
        "evaluation",
        "endpoint",
        "api",
      ],
      content: (
        <div className="flex flex-col gap-6">
          <LlmApiKeyList projectId={project.id} />
        </div>
      ),
      show: showLLMConnectionsSettings,
    },
    {
      title: "Cost & Usage",
      slug: "cost-usage",
      cmdKKeywords: ["cost", "usage", "tokens", "spend"],
      content: (
        <div className="flex flex-col gap-6">
          <CostUsagePage />
        </div>
      ),
    },
    {
      title: "Models",
      slug: "models",
      cmdKKeywords: ["cost", "token"],
      content: <ModelsSettings projectId={project.id} key={project.id} />,
    },
    // {
    //   title: "Scores / Evaluation",
    //   slug: "scores",
    //   cmdKKeywords: ["config"],
    //   content: <ScoreConfigSettings projectId={project.id} />,
    // },
    {
      title: "Members",
      slug: "members",
      cmdKKeywords: ["invite", "user"],
      content: (
        <div>
          <Header title="Project Members" />
          <div>
            <MembersTable
              orgId={organization.id}
              project={{ id: project.id, name: project.name }}
            />
          </div>
          <div>
            <MembershipInvitesPage
              orgId={organization.id}
              projectId={project.id}
            />
          </div>
        </div>
      ),
    },
    // {
    //   title: "Integrations",
    //   slug: "integrations",
    //   cmdKKeywords: ["posthog"],
    //   content: <Integrations projectId={project.id} />,
    // },
    // {
    //   title: "Exports",
    //   slug: "exports",
    //   cmdKKeywords: ["csv", "download", "json", "batch"],
    //   content: <BatchExportsSettingsPage projectId={project.id} />,
    // },
    // {
    //   title: "Billing",
    //   slug: "billing",
    //   href: `/organization/${organization.id}/settings/billing`,
    //   show: showBillingSettings,
    // },
    {
      title: "Organization Settings",
      slug: "organization",
      href: `/organization/${organization.id}/settings`,
    },
  ];
}

const SettingsPage = React.memo(() => {
  const { project, organization } = useQueryProject();
  const router = useRouter();

  // Get pages directly - memoization is already handled in useProjectSettingsPages
  const pages = useProjectSettingsPages();

  if (!project || !organization) return null;

  return (
    <div className="container mx-auto py-6">
      <Header title="Project Settings" />
      <PagedSettingsContainer
        activeSlug={router.query.page as string | undefined}
        pages={pages}
      />
    </div>
  );
});

export default SettingsPage;
