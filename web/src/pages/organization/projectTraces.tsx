import { useEffect } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { type RouterOutput } from "@/src/utils/types";
import { type FilterState } from "@langfuse/shared";
import { projectsTableCols } from "@/src/server/api/definitions/projectsTable";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import Page from "@/src/components/layouts/page";
import { UsersOnboarding } from "@/src/components/onboarding/UsersOnboarding";
import { Badge } from "@/src/components/ui/badge";

type RowData = {
  projectId: string;
  projectName: string;
  environment?: string;
  firstEvent: string;
  lastEvent: string;
  totalEvents: string;
  totalTokens: string;
  totalCost: string;
};

export default function ProjectsPage() {
  // Check if any users exist by making a minimal allGlobal query
  const { data: projectsData, isLoading } = api.projectTrace.all.useQuery({
    filter: [],
    page: 0,
    limit: 1,
  });
  const hasAnyProject = true; //(usersData?.users?.length ?? 0) > 0;

  const showOnboarding = !isLoading && !hasAnyProject;

  return (
    <Page
      headerProps={{
        title: "Projects",
        help: {
          description:
            "Attribute data in Langfuse to a user by adding a userId to your traces. See docs to learn more.",
          href: "https://langfuse.com/docs/user-explorer",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no users */}
      {showOnboarding ? <UsersOnboarding /> : <ProjectsTable />}
    </Page>
  );
}

const ProjectsTable = () => {
  const [projectFilterState, setProjectFilterState] = useQueryFilterState(
    [],
    "projects",
  );

  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange("");

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "Timestamp",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
      ]
    : [];

  const filterState = projectFilterState.concat(dateRangeFilter);

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const projects = api.projectTrace.all.useQuery({
    filter: filterState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    searchQuery: searchQuery ?? undefined,
  });

  const projectMetrics = api.projectTrace.metrics.useQuery(
    {
      projectIds: projects.data?.projects.map((u) => u.projectId) ?? [],
      filter: filterState,
    },
    {
      enabled: projects.isSuccess,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  type ProjectCoreOutput =
    RouterOutput["projectTrace"]["all"]["projects"][number];
  type ProjectMetricsOutput = RouterOutput["projectTrace"]["metrics"][number];

  type CoreType = Omit<ProjectCoreOutput, "projectId"> & {
    id: string;
    name?: string;
  };
  type MetricType = Omit<ProjectMetricsOutput, "projectId"> & {
    id: string;
    name?: string;
  };

  const projectRowData = joinTableCoreAndMetrics<CoreType, MetricType>(
    projects.data?.projects.map((u) => ({
      ...u,
      id: u.projectId,
    })),
    projectMetrics.data?.map((u) => ({
      ...u,
      id: u.projectId,
    })),
  );

  const totalCount = projects.data?.totalProjects
    ? Number(projects.data.totalProjects)
    : null;

  useEffect(() => {
    if (projects.isSuccess) {
      setDetailPageList(
        "projects",
        projects.data.projects.map((u) => ({
          id: encodeURIComponent(u.projectId),
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.isSuccess, projects.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "projectName",
      enableColumnFilter: true,
      header: "Project Name",
      size: 150,
      cell: ({ row }) => {
        const value: RowData["projectName"] = row.getValue("projectName");
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "projectId",
      enableColumnFilter: true,
      header: "Project ID",
      headerTooltip: {
        description:
          "The unique identifier for the user that was logged in Langfuse. See docs for more details on how to set this up.",
        href: "https://langfuse.com/docs/tracing-features/users",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["projectId"] = row.getValue("projectId");
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "environment",
      header: "Environment",
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: RowData["environment"] = row.getValue("environment");
        return value ? (
          <Badge
            variant="secondary"
            className="max-w-fit truncate rounded-sm px-1 font-normal"
          >
            {value}
          </Badge>
        ) : null;
      },
    },
    {
      accessorKey: "firstEvent",
      header: "First Event",
      headerTooltip: {
        description: "The earliest trace recorded for this user.",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["firstEvent"] = row.getValue("firstEvent");
        if (!projectMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "lastEvent",
      header: "Last Event",
      headerTooltip: {
        description: "The latest trace recorded for this user.",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["lastEvent"] = row.getValue("lastEvent");
        if (!projectMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "totalEvents",
      header: "Total Events",
      headerTooltip: {
        description:
          "Total number of events for the user, includes traces and observations. See data model for more details.",
        href: "https://langfuse.com/docs/tracing-data-model",
      },
      size: 120,
      cell: ({ row }) => {
        const value: RowData["totalEvents"] = row.getValue("totalEvents");
        if (!projectMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "totalTokens",
      header: "Total Tokens",
      headerTooltip: {
        description:
          "Total number of tokens used for the user across all generations.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
      size: 120,
      cell: ({ row }) => {
        const value: RowData["totalTokens"] = row.getValue("totalTokens");
        if (!projectMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      headerTooltip: {
        description: "Total cost for the user across all generations.",
        href: "https://langfuse.com/docs/model-usage-and-cost",
      },
      size: 120,
      cell: ({ row }) => {
        const value: RowData["totalCost"] = row.getValue("totalCost");
        if (!projectMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
  ];

  // Calculate totals
  const totalTokens = projectMetrics.data?.reduce(
    (sum, metric) => sum + Number(metric.totalTokens ?? 0),
    0,
  );
  const totalCost = projectMetrics.data?.reduce(
    (sum, metric) => sum + Number(metric.sumCalculatedTotalCost ?? 0),
    0,
  );

  return (
    <>
      <DataTableToolbar
        filterColumnDefinition={projectsTableCols}
        filterState={projectFilterState}
        setFilterState={useDebounce(setProjectFilterState)}
        columns={columns}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        searchConfig={{
          placeholder: "Search by project id",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
      />
      <DataTable
        columns={columns}
        data={
          projects.isLoading
            ? { isLoading: true, isError: false }
            : projects.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: projects.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: projectRowData.rows?.map((t) => {
                    return {
                      projectId: t.id,
                      projectName: t.name ?? "Unknown",
                      environment: t.environment ?? undefined,
                      firstEvent:
                        t.firstTrace?.toLocaleString() ?? "No event yet",
                      lastEvent:
                        t.lastTrace?.toLocaleString() ?? "No event yet",
                      totalEvents: compactNumberFormatter(
                        Number(t.totalTraces ?? 0) +
                          Number(t.totalObservations ?? 0),
                      ),
                      totalTokens: compactNumberFormatter(t.totalTokens ?? 0),
                      totalCost: usdFormatter(
                        t.sumCalculatedTotalCost ?? 0,
                        2,
                        5,
                      ),
                    };
                  }),
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
      {projectMetrics.isSuccess && (
        <div className="flex justify-end gap-4 p-2 text-sm">
          <div>
            <span className="font-medium">Total Tokens: </span>
            {compactNumberFormatter(totalTokens ?? 0)}
          </div>
          <div>
            <span className="font-medium">Total Cost: </span>
            {usdFormatter(totalCost ?? 0, 2, 5)}
          </div>
        </div>
      )}
    </>
  );
};
