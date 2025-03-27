import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { TopupBalanceDialog } from "./TopupBalanceDialog";
import { useEffect } from "react";

export function BalanceSection() {
  const session = useSession();
  const userId = session.data?.user?.id ?? "";

  const balanceQuery = api.balance.getBalance.useQuery(
    { userId },
    { enabled: !!userId },
  );

  // Poll for balance updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void balanceQuery.refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [balanceQuery]);

  return (
    <div className="mb-6 space-y-2">
      <div className="text-sm font-medium">Current Balance</div>
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium">
          ${balanceQuery.data?.current ?? 0}
        </div>
        <TopupBalanceDialog />
      </div>
    </div>
  );
}
