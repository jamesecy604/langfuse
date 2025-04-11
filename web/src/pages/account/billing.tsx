import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { DateRangePicker } from "@/src/components/date-range-picker";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { RefundBalanceDialog } from "@/src/features/public-api/components/RefundBalanceDialog";

type Transaction = {
  id: string;
  amount: number;
  type: "topup" | "refund" | "usage";
  timestamp: Date;
  description: string;
  paymentIntentId?: string;
};

export default function BillingPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
    to: new Date(),
  });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const { data: transactionsData, isLoading: isTransactionsLoading } =
    api.payments.getTransactions.useQuery(
      {
        from: dateRange.from,
        to: dateRange.to,
      },
      {
        onSuccess: (data) => {
          setTransactions(data);
          setIsLoading(false);
        },
        onError: () => {
          setIsLoading(false);
          toast.error("Failed to load transactions");
        },
      },
    );

  const handleExport = () => {
    // TODO: Implement CSV export
    toast.success("Export functionality coming soon");
  };

  const columns: LangfuseColumnDef<Transaction>[] = [
    {
      accessorKey: "timestamp",
      header: "Date",
      cell: ({ row }) => row.original.timestamp.toLocaleDateString(),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => row.original.description,
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => `$${row.original.amount.toFixed(2)}`,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`rounded-full px-2 py-1 text-xs capitalize ${
            row.original.type === "topup"
              ? "bg-green-100 text-green-800"
              : row.original.type === "refund"
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
          }`}
        >
          {row.original.type}
        </span>
      ),
    },
    {
      id: "actions",
      accessorKey: "id", // Required by LangfuseColumnDef
      header: "Actions",
      cell: ({ row }) => {
        if (row.original.type !== "topup") return null;

        return (
          <RefundBalanceDialog
            transactionId={row.original.id}
            maxAmount={row.original.amount}
          >
            <Button variant="ghost" size="sm">
              Refund
            </Button>
          </RefundBalanceDialog>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Billing History</h1>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <Label htmlFor="date-range">Date Range</Label>
            <DateRangePicker
              value={dateRange}
              onChange={(range) => {
                if (range) {
                  setDateRange(range);
                }
              }}
            />
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border p-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <Button onClick={handleExport} variant="outline">
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <p>Loading transactions...</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex justify-center p-8">
          <p>No transactions found</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={{
            isLoading: false,
            isError: false,
            data: transactions,
          }}
        />
      )}
    </div>
  );
}
