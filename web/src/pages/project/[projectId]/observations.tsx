import { useRouter } from "next/router";
import ObservationsTable from "@/src/components/table/use-cases/observations";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the user has any traces
  const { data: hasAnyTrace, isLoading } = api.traces.hasAny.useQuery(
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

  const showOnboarding = false; // !isLoading && !hasAnyTrace;

  return (
    <Page
      headerProps={{
        title: "Observations",
        help: {
          description: "",
          href: "",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no traces */}
      {showOnboarding ? (
        <TracesOnboarding projectId={projectId} />
      ) : (
        <ObservationsTable projectId={projectId} />
      )}
    </Page>
  );
}
