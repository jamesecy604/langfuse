import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
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
import { usersTableCols } from "@/src/server/api/definitions/usersTable";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import Page from "@/src/components/layouts/page";
import { UsersOnboarding } from "@/src/components/onboarding/UsersOnboarding";
import {
  useEnvironmentFilter,
  convertSelectedEnvironmentsToFilter,
} from "@/src/hooks/use-environment-filter";
import { Badge } from "@/src/components/ui/badge";

type UserRow = RouterOutput["users"]["all"]["users"][number] & {
  totalTraces?: number;
  observationCount?: number;
  totalUsage?: number;
  totalCost?: number;
};

type RowData = {
  userId: string;
  environment?: string;
  firstEvent: string;
  lastEvent: string;
  totalEvents: string;
  totalTokens: string;
  totalCost: string;
};

const safeToNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }
  return null;
};

const UsersTable = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "users",
    projectId,
  );

  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);

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

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 60 * 60 * 1000, // 1 hour cache
      },
    );

  const environmentOptions =
    environmentFilterOptions.data?.map((value) => value.environment) || [];

  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);

  const environmentFilter = convertSelectedEnvironmentsToFilter(
    ["environment"],
    selectedEnvironments,
  );

  const filterState = userFilterState.concat(
    dateRangeFilter,
    environmentFilter,
  );

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const users = api.users.all.useQuery(
    {
      projectId,
      filter: filterState,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      searchQuery: searchQuery ?? undefined,
    },
    {
      keepPreviousData: true,
    },
  );

  const userRowData = users.data?.users ?? [];
  const totalCount = safeToNumber(users.data?.totalUsers) ?? 0;

  const columns = useMemo<LangfuseColumnDef<RowData>[]>(
    () => [
      {
        accessorKey: "userId",
        enableColumnFilter: true,
        header: "User ID",
        headerTooltip: {
          description:
            "The unique identifier for the user that was logged in Langfuse. See docs for more details on how to set this up.",
          href: "https://langfuse.com/docs/tracing-features/users",
        },
        size: 150,
        cell: ({ row }) => {
          const value: RowData["userId"] = row.getValue("userId");
          return typeof value === "string" ? (
            <TableLink
              path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
              value={value}
            />
          ) : undefined;
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
          return typeof value === "string" ? <>{value}</> : null;
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
          return typeof value === "string" ? <>{value}</> : null;
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
          return typeof value === "string" ? (
            <>{value}</>
          ) : (
            <Skeleton className="h-3 w-1/2" />
          );
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
          return typeof value === "string" ? (
            <>{value}</>
          ) : (
            <Skeleton className="h-3 w-1/2" />
          );
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
          return typeof value === "string" ? (
            <>{value}</>
          ) : (
            <Skeleton className="h-3 w-1/2" />
          );
        },
      },
    ],
    [projectId],
  );

  return (
    <>
      <DataTableToolbar
        filterColumnDefinition={usersTableCols}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        columns={columns}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        searchConfig={{
          placeholder: "Search by user id",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        environmentFilter={{
          values: selectedEnvironments,
          onValueChange: setSelectedEnvironments,
          options: environmentOptions.map((env) => ({ value: env })),
        }}
      />
      <DataTable
        columns={columns}
        data={
          users.isLoading
            ? { isLoading: true, isError: false }
            : users.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: users.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: userRowData.map((user) => {
                    const totalTraces = safeToNumber(user.totalTraces) ?? 0;
                    const observationCount =
                      safeToNumber(user.observationCount) ?? 0;
                    const totalUsage = safeToNumber(user.totalUsage) ?? 0;
                    const totalCost = safeToNumber(user.totalCost) ?? 0;

                    const totalEvents = totalTraces + observationCount;

                    return {
                      userId: user.userId,
                      environment: user.environment ?? undefined,
                      firstEvent:
                        user.minTimestamp?.toLocaleString() ?? "No event yet",
                      lastEvent:
                        user.maxTimestamp?.toLocaleString() ?? "No event yet",
                      totalEvents: compactNumberFormatter(totalEvents),
                      totalTokens: compactNumberFormatter(totalUsage),
                      totalCost: usdFormatter(safeToNumber(totalCost) ?? 0),
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
    </>
  );
};

export default UsersTable;
