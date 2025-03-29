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
import { type DateRange } from "@/src/components/date-range-picker";
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
  secretKey: string;
  provider: string;
  llmApiKeyId?: string;
};

type UsageItem = RawUsageItem & {
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
    return data.items.map((item: RawUsageItem) => ({
      ...item,
      displaySecretKey: `${item.secretKey.slice(0, 4)}...${item.secretKey.slice(-4)}`,
    }));
  }
  const singleItem = data as RawUsageItem;
  return [
    {
      ...singleItem,
      displaySecretKey: `${singleItem.secretKey.slice(0, 4)}...${singleItem.secretKey.slice(-4)}`,
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

  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [secretKeyFilter, setSecretKeyFilter] = useState<string>("");

  const apiKeys = api.llmApiKeyUsage.usage.useQuery(
    {
      projectId,
      displaySecretKey: secretKeyFilter || "",
      from: dateRange.from,
      to: dateRange.to,
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
        return cost ? `$${cost.toFixed(4)}` : "-";
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
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex gap-2">
            <Input
              placeholder="Filter by API Key"
              value={secretKeyFilter}
              onChange={(e) => setSecretKeyFilter(e.target.value)}
              className="max-w-xs"
            />
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="cohere">Cohere</SelectItem>
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
              value: `$${totals.totalCost.toFixed(4)}`,
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
