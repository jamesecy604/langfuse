import { useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { toast } from "sonner";
import { api } from "../../../utils/api";

export function RefundBalanceDialog({
  transactionId,
  maxAmount,
  children,
}: {
  transactionId: string;
  maxAmount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(maxAmount.toString());
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { mutateAsync: refund } = api.payments.refund.useMutation();

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0 || amountNum > maxAmount) {
        toast.error(`Amount must be between $0.01 and $${maxAmount}`);
        return;
      }

      await refund({
        transactionId,
        amount: -amountNum, // Pass negative amount for refunds
        reason,
      });

      toast.success("Refund processed successfully");
      setOpen(false);
    } catch (error) {
      toast.error("Failed to process refund");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Refund</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Amount (max ${maxAmount})</Label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              max={maxAmount}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you requesting this refund?"
            />
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : "Submit Refund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
