import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import Page from "@/src/components/layouts/page";
import { SessionsOnboarding } from "@/src/components/onboarding/SessionsOnboarding";
import { api } from "@/src/utils/api";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { data: hasAnySession, isLoading } = api.sessions.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
    },
  );

  const showOnboarding = false; // !isLoading && !hasAnySession;

  return (
    <Page
      headerProps={{
        title: "Sessions",
        help: {
          description: "",
          href: "",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no sessions */}
      {showOnboarding ? (
        <SessionsOnboarding />
      ) : (
        <SessionsTable projectId={projectId} />
      )}
    </Page>
  );
}
