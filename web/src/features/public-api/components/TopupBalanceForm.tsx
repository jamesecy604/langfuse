import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useToast } from "../../../hooks/useToast";
import { api } from "../../../utils/api";
import { useSession } from "next-auth/react";

interface TopupBalanceFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopupBalanceForm({
  isOpen,
  onOpenChange,
}: TopupBalanceFormProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const session = useSession();
  const userId = session.data?.user?.id ?? "";

  const topupMutation = api.balance.topupBalance.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast.error("User ID is required");
      return;
    }
    setIsLoading(true);
    try {
      await topupMutation.mutateAsync({
        userId,
        amount: Number(amount),
        description,
      });
      toast.success(`Successfully added ${amount} credits`);
      setAmount("");
      setDescription("");
    } catch (error) {
      toast.error("Failed to update balance");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        handleSubmit(e);
        onOpenChange(false);
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="amount" className="block text-sm font-medium">
          Amount
        </label>
        <Input
          id="amount"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description (optional)
        </label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Processing..." : "Add Credits"}
      </Button>
    </form>
  );
}
