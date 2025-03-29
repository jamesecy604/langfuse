import { useRouter } from "next/router";
import { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DataTable } from "@/src/components/table/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type RouterOutputs } from "@/src/utils/api";
import Header from "@/src/components/layouts/header";
import { Card } from "@/src/components/ui/card";
import StatsCard from "@/src/components/stats-cards";
import { DateRangePicker } from "@/src/components/date-range-picker";
import { type DateRange } from "@/src/components/date-range-picker";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

type UsageData = RouterOutputs["llmApiKeyUsage"]["byDisplaySecretKey"][0];

function calculateTotals(data: UsageData[]) {
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
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [secretKeyFilter, setSecretKeyFilter] = useState<string>("");

  const apiKeys = api.llmApiKeyUsage.byDisplaySecretKey.useQuery(
    {
      projectId,
      from: dateRange.from,
      to: dateRange.to,
      provider: providerFilter || undefined,
      displaySecretKey: secretKeyFilter || undefined,
    },
    { enabled: hasAccess },
  );

  const columns: LangfuseColumnDef<UsageData>[] = [
    {
      accessorKey: "displaySecretKey",
      header: "API Key",
    },
    {
      accessorKey: "tokens",
      header: "Tokens Used",
      cell: ({ row }) => row.original.tokens.toLocaleString(),
    },
    {
      accessorKey: "cost",
      header: "Cost",
      cell: ({ row }) =>
        row.original.cost ? `$${row.original.cost.toFixed(4)}` : "-",
    },
  ];

  if (!hasAccess) {
    return <div>You don't have access to view this page</div>;
  }

  return (
    <div className="md:container">
      <Header
        title="LLM API Key Cost & Usage"
        help="View usage and costs for your LLM API keys"
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
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
              <SelectItem value="">All Providers</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="cohere">Cohere</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <StatsCard
          title="Total Tokens"
          value={
            apiKeys.data
              ? calculateTotals(apiKeys.data.data).totalTokens.toLocaleString()
              : "-"
          }
          isLoading={apiKeys.isLoading}
        />
        <StatsCard
          title="Total Cost"
          value={
            apiKeys.data
              ? `$${calculateTotals(apiKeys.data.data).totalCost.toFixed(4)}`
              : "-"
          }
          isLoading={apiKeys.isLoading}
        />
      </div>
      <Card className="mt-5">
        <DataTable
          columns={columns}
          data={{
            data: apiKeys.data || [],
            isLoading: apiKeys.isLoading,
            isError: apiKeys.isError,
          }}
        />
      </Card>
    </div>
  );
}
