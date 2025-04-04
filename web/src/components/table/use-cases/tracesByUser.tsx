import { DataTable } from "@/src/components/table/data-table";
import { type Decimal } from "@prisma/client/runtime/library";

type TraceByUser = {
  id: string;
  timestamp: Date;
  name: string | null;
  projectId: string;
  userId: string | null;
  release: string | null;
  version: string | null;
  public: boolean;
  bookmarked: boolean;
  environment: string | null;
  sessionId: string | null;
  tags: string[];
};

import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { Badge } from "@/src/components/ui/badge";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { type RowSelectionState } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import {
  NumberParam,
  StringParam,
  useQueryParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { type FilterState } from "@langfuse/shared";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import { Skeleton } from "@/src/components/ui/skeleton";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { cn } from "@/src/utils/tailwind";

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type TracesByUserTableRow = {
  id: string;
  timestamp: Date;
  name: string;
  projectId: string;
  userId?: string | null;
  release?: string | null;
  version?: string | null;
  public?: boolean;
  bookmarked?: boolean;
  environment?: string | null;
  sessionId?: string | null;
  tags?: string[];
  usage?: TokenUsage;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
};

export type TracesByUserTableProps = {
  userId: string;
  omittedFilter?: string[];
};

export default function TracesByUserTable({
  userId,
  omittedFilter = [],
}: TracesByUserTableProps) {
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(userId, "user");
  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "traces",
  );
  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

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
  const userIdFilter: FilterState = [
    {
      column: "User ID",
      type: "string",
      operator: "=",
      value: userId,
    },
  ];

  const filterState = userFilterState.concat(userIdFilter, dateRangeFilter);
  const [pageIndex, setPageIndex] = useQueryParam(
    "pageIndex",
    withDefault(NumberParam, 0),
  );
  const [pageSize, setPageSize] = useQueryParam(
    "pageSize",
    withDefault(NumberParam, 50),
  );

  const tracesQuery = api.traces.allByUser.useQuery({
    userId,
    filter: filterState,
    searchQuery,
    page: pageIndex,
    limit: pageSize,
    orderBy: orderByState,
  });

  const traceMetrics = api.traces.metricsByUser.useQuery(
    {
      userId,
      filter: filterState,
      traceIds: tracesQuery.data?.traces.map((t) => t.id) ?? [],
    },
    {
      enabled: tracesQuery.data !== undefined,
    },
  );

  const columns: LangfuseColumnDef<TracesByUserTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      id: "id",
      size: 90,
      cell: ({ row }) => {
        const value: string =
          row.getValue("id") + "||" + row.getValue("projectId") + "||" + userId;
        const timestamp: Date = row.getValue("timestamp");

        return (
          <TableLink
            path={`/traces/${encodeURIComponent(value)}?timestamp=${encodeURIComponent(timestamp.toISOString())}`}
            value={row.getValue("id")}
          />
        );
      },
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      size: 150,
      cell: ({ row }) => {
        const value: Date = row.getValue("timestamp");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
    },
    {
      accessorKey: "projectId",
      header: "Project",
      id: "projectId",
      size: 150,
      // cell: ({ row }) => {
      //   const value: string = row.getValue("projectId");
      //   return <TableLink path={`/project/${value}`} value={value} />;
      // },
    },
    // {
    //   accessorKey: "latency",
    //   id: "latency",
    //   header: "Latency",
    //   size: 70,
    //   cell: ({ row }) => {
    //     const value: number | undefined = row.getValue("latency");
    //     return value !== undefined ? formatIntervalSeconds(value) : "-";
    //   },
    // },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      size: 220,
      cell: ({ row }) => {
        const value: TokenUsage = row.getValue("usage") ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        };
        return (
          <TokenUsageBadge
            promptTokens={Number(value.promptTokens ?? 0)}
            completionTokens={Number(value.completionTokens ?? 0)}
            totalTokens={Number(value.totalTokens ?? 0)}
            inline
          />
        );
      },
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: "Total Cost",
      size: 100,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");
        return value !== undefined ? usdFormatter(value) : "-";
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<TracesByUserTableRow>(
      "tracesByUserColumnVisibility",
      columns,
    );

  type TracesByUserResponse = {
    traces: TraceByUser[];
    totalCount: number;
  };

  const rows = useMemo(() => {
    if (!tracesQuery.isSuccess) return [];

    const traceMetricsMap = new Map(
      traceMetrics.data?.map((metric) => [metric.id, metric]) ?? [],
    );

    return (tracesQuery.data as TracesByUserResponse).traces.map(
      (trace: TraceByUser) => {
        const metrics = traceMetricsMap.get(trace.id);
        return {
          id: trace.id,
          timestamp: trace.timestamp,
          name: trace.name ?? "",
          projectId: trace.projectId,
          userId: trace.userId,
          release: trace.release,
          version: trace.version,
          public: trace.public,
          bookmarked: trace.bookmarked,
          environment: trace.environment,
          sessionId: trace.sessionId,
          tags: trace.tags,
          usage: {
            promptTokens:
              metrics?.promptTokens !== undefined
                ? Number(metrics.promptTokens)
                : undefined,
            completionTokens:
              metrics?.completionTokens !== undefined
                ? Number(metrics.completionTokens)
                : undefined,
            totalTokens:
              metrics?.totalTokens !== undefined
                ? Number(metrics.totalTokens)
                : undefined,
          },
          usageDetails: metrics?.usageDetails,
          costDetails: metrics?.costDetails,
          inputCost: metrics?.calculatedInputCost?.toNumber(),
          outputCost: metrics?.calculatedOutputCost?.toNumber(),
          totalCost: metrics?.calculatedTotalCost?.toNumber(),
        };
      },
    );
  }, [tracesQuery, traceMetrics.data]);

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        searchConfig={{
          placeholder: "Search by id, name, project id",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
      />
      <DataTable
        columns={columns}
        data={
          tracesQuery.isLoading
            ? { isLoading: true, isError: false, data: [] }
            : tracesQuery.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: tracesQuery.error.message,
                  data: [],
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: rows,
                }
        }
        pagination={{
          totalCount:
            (tracesQuery.data as TracesByUserResponse)?.totalCount ?? 0,
          onChange: (updater) => {
            if (typeof updater === "function") {
              const newState = updater({ pageIndex, pageSize });
              setPageIndex(newState.pageIndex);
              setPageSize(newState.pageSize);
            } else {
              setPageIndex(updater.pageIndex);
              setPageSize(updater.pageSize);
            }
          },
          state: { pageIndex, pageSize },
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        rowSelection={selectedRows}
        setRowSelection={setSelectedRows}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </>
  );
}
