import { useRouter } from "next/router";
import { useState } from "react";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DataTable } from "@/src/components/table/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutputs } from "@/src/utils/api";
import Header from "@/src/components/layouts/header";
import { Card } from "@/src/components/ui/card";
import { DateRangePicker } from "@/src/components/date-range-picker";
import type { DateRange } from "@/src/components/date-range-picker";
import { TimePicker } from "@/src/components/ui/time-picker";
import StatsCards from "@/src/components/stats-cards";
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

type RawUsageItem = {
  tokens: number;
  cost: number | null;
  provider: string;
  llmApiKeyId?: string;
  displaySecretKey: string;
};

type UsageItem = {
  tokens: number;
  cost: number | null;
  provider: string;
  llmApiKeyId?: string;
  displaySecretKey: string;
};

type PaginatedUsageResponse = {
  items: RawUsageItem[];
  summaryCost: number;
  summaryToken: number;
};

type UsageResponse = PaginatedUsageResponse | RawUsageItem | undefined;

function normalizeUsageData(data: UsageResponse): UsageItem[] {
  if (!data) return [];
  if ("items" in data) {
    return data.items.map((item) => ({
      tokens: item.tokens,
      cost: item.cost,
      provider: item.provider,
      llmApiKeyId: item.llmApiKeyId,
      displaySecretKey: item.displaySecretKey, // Convert secretKey to displaySecretKey
    }));
  }
  return [
    {
      tokens: data.tokens,
      cost: data.cost,
      provider: data.provider,
      llmApiKeyId: data.llmApiKeyId,
      displaySecretKey: data.displaySecretKey, // Convert secretKey to displaySecretKey
    },
  ];
}

function calculateTotals(data: UsageItem[]) {
  return {
    totalTokens: data.reduce((sum, item) => sum + item.tokens, 0),
    totalCost: data.reduce((sum, item) => sum + (item.cost || 0), 0),
  };
}

export default function CostUsagePage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:read",
  });

  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [secretKeyFilter, setSecretKeyFilter] = useState<string>("all");
  const [dateError, setDateError] = useState<string | null>(null);

  const allApiKeys = api.llmApiKeyUsage.list.useQuery(
    { projectId },
    { enabled: hasAccess },
  );

  const providers = api.llmApiKeyUsage.providers.useQuery(
    { projectId },
    { enabled: hasAccess },
  );

  const apiKeys = api.llmApiKeyUsage.usage.useQuery(
    {
      projectId,
      displaySecretKey: secretKeyFilter === "all" ? undefined : secretKeyFilter,
      from: dateRange?.from,
      to: dateRange?.to,
      provider: providerFilter === "all" ? undefined : providerFilter,
    },
    { enabled: hasAccess },
  );

  const normalizedData: UsageItem[] = normalizeUsageData(apiKeys.data);
  const totals = calculateTotals(normalizedData);

  const columns: LangfuseColumnDef<UsageItem>[] = [
    {
      accessorKey: "displaySecretKey",
      header: "API Key",
    },
    {
      accessorKey: "tokens",
      header: "Tokens Used",
      cell: ({ row }) => row.getValue<number>("tokens").toLocaleString(),
    },
    {
      accessorKey: "cost",
      header: "Cost",
      cell: ({ row }) => {
        const cost = row.getValue<number | null>("cost");
        if (cost === null) return "-";
        // Show more decimal places for very small values
        return cost < 0.0001 ? `$${cost.toFixed(8)}` : `$${cost.toFixed(4)}`;
      },
    },
  ];

  if (!hasAccess) {
    return (
      <div className="p-4">You don't have access to view LLM API key usage</div>
    );
  }

  return (
    <>
      <Header
        title="LLM API Key Cost & Usage"
        help={{
          description: "View usage and costs for your LLM API keys",
        }}
      />
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-2">
              <DateRangePicker
                value={dateRange ?? undefined}
                onChange={(range: DateRange | null) => {
                  if (!range?.from || !range?.to) {
                    setDateRange(null);
                    setDateError(null);
                    return;
                  }

                  // Validate date range
                  if (range.from > range.to) {
                    setDateError("Start date must be before end date");
                    return;
                  }

                  // Validate custom range doesn't exceed 90 days
                  const maxDays = 90;
                  const diffDays = Math.ceil(
                    (range.to.getTime() - range.from.getTime()) /
                      (1000 * 60 * 60 * 24),
                  );
                  if (diffDays > maxDays) {
                    setDateError(`Date range cannot exceed ${maxDays} days`);
                    return;
                  }
                  setDateError(null);

                  // Store dates as-is (local time) but ensure backend handles them correctly
                  setDateRange(range);
                }}
                showTime
                presets={[
                  {
                    label: "Last 7 days",
                    value: "7d",
                  },
                  {
                    label: "Last 30 days",
                    value: "30d",
                    getDateRange: () => {
                      const now = new Date();
                      const from = new Date();
                      from.setDate(now.getDate() - 30);
                      from.setHours(0, 0, 0, 0); // Set to 12am
                      return { from, to: now };
                    },
                  },
                  {
                    label: "Last 90 days",
                    value: "90d",
                    getDateRange: () => {
                      const now = new Date();
                      const from = new Date();
                      from.setDate(now.getDate() - 90);
                      from.setHours(0, 0, 0, 0); // Set to 12am
                      return { from, to: now };
                    },
                  },
                ]}
              />
              {dateRange && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">
                    {dateRange.from.toLocaleString()} -{" "}
                    {dateRange.to.toLocaleString()}
                  </span>
                  {dateError && (
                    <span className="text-sm text-red-500">{dateError}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={secretKeyFilter} onValueChange={setSecretKeyFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All API Keys" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All API Keys</SelectItem>
                {allApiKeys.data?.map((key: { displaySecretKey: string }) => (
                  <SelectItem
                    key={key.displaySecretKey}
                    value={key.displaySecretKey}
                  >
                    {key.displaySecretKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {providers.data?.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <StatsCards
          stats={[
            {
              name: "Total Tokens",
              value: totals.totalTokens.toLocaleString(),
            },
            {
              name: "Total Cost",
              value:
                totals.totalCost < 0.0001
                  ? `$${totals.totalCost.toFixed(8)}`
                  : `$${totals.totalCost.toFixed(4)}`,
            },
          ]}
        />
        <Card className="mt-5">
          <DataTable
            columns={columns}
            data={{
              data: normalizedData,
              isLoading: apiKeys.isLoading,
              isError: apiKeys.isError,
            }}
          />
        </Card>
      </div>
    </>
  );
}
