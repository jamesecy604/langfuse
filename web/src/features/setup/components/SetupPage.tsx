import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { NewOrganizationForm } from "@/src/features/organizations/components/NewOrganizationForm";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { NewProjectForm } from "@/src/features/projects/components/NewProjectForm";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ApiKeyRender } from "@/src/features/public-api/components/CreateApiKeyButtonUser";
import { QuickstartExamples } from "@/src/features/public-api/components/QuickstartExamples";
import { MembershipInvitesPage } from "@/src/features/rbac/components/MembershipInvitesPage";
import { MembersTable } from "@/src/features/rbac/components/MembersTable";
import {
  createProjectRoute,
  inviteMembersRoute,
  setupTracingRoute,
} from "@/src/features/setup/setupRoutes";
import { showChat } from "@/src/features/support-chat/chat";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { Check } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { StringParam, useQueryParam } from "use-query-params";

// Multi-step setup process
// 1. Create Organization: /setup
// 2. Invite Members: /organization/:orgId/setup
// 3. Create Project: /organization/:orgId/setup?step=create-project
// 4. Setup Tracing: /project/:projectId/setup
export function SetupPage() {
  const { project, organization } = useQueryProjectOrOrganization();
  const router = useRouter();
  const [orgStep] = useQueryParam("orgstep", StringParam); // "invite-members" | "create-project"
  const queryProjectId = router.query.projectId as string | undefined;
  const { data: systemOrgId } = api.system.getSystemOrg.useQuery();
  const setSystemOrgMutation = api.system.setSystemOrg.useMutation();

  // starts at 1 to align with breadcrumb
  const stepInt = !organization
    ? 1
    : project
      ? 4
      : orgStep === "create-project"
        ? 3
        : 2;

  const hasAnyTrace = api.traces.hasAny.useQuery(
    { projectId: queryProjectId as string },
    {
      enabled: queryProjectId !== undefined && stepInt === 4,
      refetchInterval: 5000,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  ).data;

  const capture = usePostHogClientCapture();
  useEffect(() => {
    if (hasAnyTrace !== undefined) {
      capture("onboarding:tracing_check_active", { active: hasAnyTrace });
    }
  }, [hasAnyTrace, capture]);

  return (
    <ContainerPage
      headerProps={{
        title: "Setup",
        help: {
          description:
            "Create a new organization. This will be used to manage your projects and teams.",
        },
        ...(stepInt === 1 && {
          breadcrumb: [
            {
              name: "Organizations",
              href: "/",
            },
          ],
        }),
      }}
    >
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 1
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              1. Create Organization
              {stepInt > 1 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 2
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              2. Invite Members
              {stepInt > 2 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 3
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              3. Create Project
              {stepInt > 3 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 4
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              4. Setup Tracing
              {stepInt === 4 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card className="p-3">
        {
          // 1. Create Org
          stepInt === 1 && (
            <div>
              <Header title="New Organization" />
              <p className="mb-4 text-sm text-muted-foreground">
                Organizations are used to manage your projects and teams.
              </p>
              <NewOrganizationForm
                onSuccess={async (orgId) => {
                  // Set system org ID and create default project
                  try {
                    // Verify TRPC mutation is properly initialized
                    if (!setSystemOrgMutation?.mutateAsync) {
                      throw new Error(
                        "TRPC mutation not properly initialized - check your TRPC client setup",
                      );
                    }
                    try {
                      const result = await setSystemOrgMutation.mutateAsync({
                        orgId,
                      });

                      if (!result?.success) {
                        console.error(
                          "System org setup failed - no result returned",
                        );
                        throw new Error("System org setup failed");
                      }

                      // Ensure navigation happens after successful mutation
                      await router.push(inviteMembersRoute(orgId));
                      return result;
                    } catch (err) {
                      console.error("Failed to navigate to next step:", err);
                      throw err;
                    }
                  } catch (error) {
                    console.groupCollapsed("System Setup Error");
                    console.error("Failed to set system org:", error);
                    if (error instanceof Error) {
                      if (
                        error.message.includes(
                          "System organization already configured",
                        )
                      ) {
                        console.error(
                          "System organization is already configured. Please contact support if you need to change this.",
                        );
                      } else if (
                        error.message.includes(
                          "System setup endpoint not available",
                        )
                      ) {
                        console.error(
                          "System setup feature is not available in this environment",
                        );
                      } else {
                        console.error(
                          `Failed to complete system setup: ${error.message}`,
                        );
                      }
                    } else {
                      console.error("Failed to complete system setup");
                    }
                    console.groupEnd();
                  }
                }}
              />
            </div>
          )
        }
        {
          // 2. Invite Members
          stepInt === 2 && organization && (
            <div className="flex flex-col gap-10">
              <div>
                <Header title="Organization Members" />
                <p className="mb-4 text-sm text-muted-foreground">
                  Invite members to your organization to collaborate on
                  projects. You can always add more members later.
                </p>
                <MembersTable orgId={organization.id} />
              </div>
              <div>
                <MembershipInvitesPage orgId={organization.id} />
              </div>
            </div>
          )
        }
        {
          // 3. Create Project
          stepInt === 3 && organization && (
            <div>
              <Header title="New Project" />
              <p className="mb-4 text-sm text-muted-foreground">
                Projects are used to group traces, datasets, evals and prompts.
                Multiple environments are best separated via tags within a
                project.
              </p>
              <NewProjectForm
                orgId={organization.id}
                onSuccess={(projectId) =>
                  router.push(setupTracingRoute(projectId))
                }
                wizardMode={true}
              />
            </div>
          )
        }
        {
          // 4. Setup Tracing
          stepInt === 4 && project && organization && (
            <div className="space-y-8">
              <div>
                <Header title="API Keys" />
                <p className="mb-4 text-sm text-muted-foreground">
                  These keys are used to authenticate your API requests. You can
                  create more keys later in the project settings.
                </p>
                <TracingSetup
                  projectId={project.id}
                  hasAnyTrace={hasAnyTrace ?? false}
                />
              </div>
            </div>
          )
        }
      </Card>
      {stepInt === 2 && organization && (
        <Button
          className="mt-4"
          data-testid="btn-skip-add-members"
          onClick={() => router.push(createProjectRoute(organization.id))}
        >
          Next
        </Button>
      )}
      {
        // 4. Setup Tracing
        stepInt === 4 && project && (
          <Button
            className="mt-4"
            onClick={() => router.push(`/project/${project.id}`)}
            variant={hasAnyTrace ? "default" : "secondary"}
          >
            {hasAnyTrace ? "Open Dashboard" : "Skip for now"}
          </Button>
        )
      }
    </ContainerPage>
  );
}

const TracingSetup = ({
  projectId,
  hasAnyTrace,
}: {
  projectId: string;
  hasAnyTrace?: boolean;
}) => {
  const [apiKeys, setApiKeys] = useState<
    RouterOutput["userApiKeys"]["create"] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();
  const { data: session } = useSession();
  const mutCreateApiKey = api.userApiKeys.create.useMutation({
    onSuccess: () => {
      utils.userApiKeys.invalidate();
      showChat();
    },
  });
  const isLoadingRef = useRef(false);

  useEffect(() => {
    const createApiKey = async () => {
      if (projectId && !isLoadingRef.current && !apiKeys && session?.user?.id) {
        isLoadingRef.current = true;
        setError(null);
        try {
          const apiKey = await mutCreateApiKey.mutateAsync({
            projectId,
            userId: session.user.id,
          });
          setApiKeys(apiKey);
        } catch (error) {
          console.error("Error creating API key:", error);
          setError("Failed to create API key. Please try again.");
        } finally {
          isLoadingRef.current = false;
        }
      }
    };
    createApiKey();
  }, [projectId, session?.user?.id]);

  return (
    <div className="space-y-8">
      <div>
        <ApiKeyRender generatedKeys={apiKeys ?? undefined} />
      </div>
      {apiKeys && (
        <div>
          <Header
            title="Setup Tracing"
            status={hasAnyTrace ? "active" : "pending"}
          />
          <p className="mb-4 text-sm text-muted-foreground">
            Tracing is used to track and analyze your LLM calls. You can always
            skip this step and setup tracing later.
          </p>
          <QuickstartExamples
            secretKey={apiKeys.secretKey}
            publicKey={apiKeys.publicKey}
          />
        </div>
      )}
    </div>
  );
};
