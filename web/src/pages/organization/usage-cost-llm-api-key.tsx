import { useEffect, ReactElement } from "react";
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
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import Page from "@/src/components/layouts/page";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Badge } from "@/src/components/ui/badge";

type RowData = {
  apiKeyId: string;
  apiKeyName: string;
  totalTokens: string;
  totalCost: string;
};

export default function LLMApiKeyUsagePage() {
  return (
    <Page
      headerProps={{
        title: "LLM API Key Usage",
        help: {
          description: "Show summary of usage and cost by LLM API key.",
          href: "",
        },
      }}
    >
      <LLMApiKeyUsageTable />
    </Page>
  );
}

const LLMApiKeyUsageTable = (): ReactElement => {
  const [apiKeyFilterState, setApiKeyFilterState] = useQueryFilterState(
    [],
    "llmApiKeys",
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

  const filterState = apiKeyFilterState.concat(dateRangeFilter);

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const apiKeys = api.usageByLLMApiKeyRouter.all.useQuery({
    filter: filterState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    searchQuery: searchQuery ?? undefined,
  });

  const apiKeyMetrics = api.usageByLLMApiKeyRouter.metrics.useQuery(
    {
      llmApiKeyIds: apiKeys.data?.usageList.map((k) => k.llmApiKeyId) ?? [],
      filter: filterState,
    },
    {
      enabled: apiKeys.isSuccess,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  type ApiKeyCoreOutput =
    RouterOutput["usageByLLMApiKeyRouter"]["all"]["usageList"][number];
  type ApiKeyMetricsOutput =
    RouterOutput["usageByLLMApiKeyRouter"]["metrics"][number];

  type CoreType = Omit<ApiKeyCoreOutput, "llmApiKeyId"> & {
    id: string;
    name?: string;
  };
  type MetricType = Omit<ApiKeyMetricsOutput, "llmApiKeyId"> & {
    id: string;
    name?: string;
  };

  const apiKeyRowData = joinTableCoreAndMetrics<CoreType, MetricType>(
    apiKeys.data?.usageList.map((k) => ({
      ...k,
      id: k.llmApiKeyId,
    })),
    apiKeyMetrics.data?.map((k) => ({
      ...k,
      id: k.llmApiKeyId,
    })),
  );

  const totalCount = apiKeys.data?.totalCount?.totalCount
    ? Number(apiKeys.data.totalCount.totalCount)
    : null;

  useEffect(() => {
    if (apiKeys.isSuccess) {
      setDetailPageList(
        "llmApiKeys",
        apiKeys.data.usageList.map((k) => ({
          id: encodeURIComponent(k.llmApiKeyId),
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys.isSuccess, apiKeys.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "apiKeyName",
      enableColumnFilter: true,
      header: "API Key Name",
      headerTooltip: {
        description: "The name of the LLM API key.",
        href: "",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["apiKeyName"] = row.getValue("apiKeyName");
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "apiKeyId",
      enableColumnFilter: true,
      header: "API Key ID",
      headerTooltip: {
        description: "The unique identifier for the LLM API key.",
        href: "",
      },
      size: 150,
      cell: ({ row }) => {
        const value: RowData["apiKeyId"] = row.getValue("apiKeyId");
        return typeof value === "string" ? <>{value}</> : undefined;
      },
    },
    {
      accessorKey: "totalTokens",
      header: "Total Tokens",
      headerTooltip: {
        description:
          "Total number of tokens used with this API key across all generations.",
        href: "",
      },
      size: 120,
      cell: ({ row }) => {
        const value: RowData["totalTokens"] = row.getValue("totalTokens");
        if (!apiKeyMetrics.isSuccess) {
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
        description: "Total cost for this API key across all generations.",
        href: "",
      },
      size: 120,
      cell: ({ row }) => {
        const value: RowData["totalCost"] = row.getValue("totalCost");
        if (!apiKeyMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        if (typeof value === "string") {
          return <>{value}</>;
        }
      },
    },
  ];

  // Calculate totals
  const totalTokens = apiKeyMetrics.data?.reduce(
    (sum, metric) => sum + Number(metric.tokens ?? 0),
    0,
  );
  const totalCost = apiKeyMetrics.data?.reduce(
    (sum, metric) => sum + Number(metric.cost ?? 0),
    0,
  );

  return (
    <>
      <DataTableToolbar
        filterState={apiKeyFilterState}
        setFilterState={useDebounce(setApiKeyFilterState)}
        columns={columns}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
        searchConfig={{
          placeholder: "Search by API key id",
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
        }}
      />
      <DataTable
        columns={columns}
        data={
          apiKeys.isLoading
            ? { isLoading: true, isError: false }
            : apiKeys.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: apiKeys.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: apiKeyRowData.rows?.map((k) => {
                    return {
                      apiKeyId: k.id,
                      apiKeyName: k.name ?? "Unknown",
                      totalTokens: compactNumberFormatter(
                        Number(k.tokens ?? 0),
                      ),
                      totalCost: usdFormatter(k.cost ?? 0, 2, 5),
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
      {apiKeyMetrics.isSuccess && (
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
