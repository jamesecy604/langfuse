import { TracePageNotInProject } from "@/src/components/trace/TracePageNotInProject";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";

export default function Trace() {
  const router = useRouter();

  const traceId = router.query.traceId as string;
  const pathValue = traceId.split("||");
  const timestamp =
    router.query.timestamp && typeof router.query.timestamp === "string"
      ? new Date(
          new Date(decodeURIComponent(router.query.timestamp)).toISOString(),
        )
      : undefined;

  return (
    <TracePageNotInProject
      traceId={pathValue[0]}
      projectId={pathValue[1]}
      timestamp={timestamp}
      userId={pathValue[2]}
    />
  );
}
