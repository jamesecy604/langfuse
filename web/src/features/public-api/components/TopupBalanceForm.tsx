import { useState, useCallback, useEffect } from "react";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { toast } from "sonner";
import { api } from "../../../utils/api";
import { useSession } from "next-auth/react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

const amountOptions = [10, 20, 50, 100];
const MIN_AMOUNT = 5;
const MAX_AMOUNT = 1000;

export function TopupBalanceForm({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState<number>(amountOptions[0]);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);
  const session = useSession();
  const userId = session.data?.user?.id ?? "";

  const { data: balanceData, isLoading: isBalanceLoading } =
    api.balance.getBalance.useQuery(
      { userId },
      {
        onSuccess: (data) => {
          setBalance(data?.current ?? 0);
          setIsLoadingBalance(false);
        },
        onError: () => {
          setIsLoadingBalance(false);
        },
      },
    );

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setCustomAmount(value);
      if (value) {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          setAmount(numValue);
        }
      }
    }
  };

  const handleCustomAmountBlur = () => {
    if (customAmount) {
      const numValue = parseInt(customAmount, 10);
      if (numValue < MIN_AMOUNT || numValue > MAX_AMOUNT) {
        toast.error(`Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}`);
      }
    }
  };

  const { mutateAsync: createCheckoutSession } =
    api.payments.createCheckoutSession.useMutation();

  const handleCheckout = useCallback(async () => {
    try {
      setIsLoadingPayment(true);
      const amountInCents = Math.round(amount * 100);
      if (amountInCents < 50) {
        toast.error("Minimum payment amount is $0.50");
        return;
      }

      const { url } = await createCheckoutSession({
        amount: amountInCents,
        successUrl: `${window.location.origin}/account/billing?payment=success`,
        cancelUrl: `${window.location.origin}/account/billing?payment=canceled`,
      });
      window.location.href = url;
    } catch (error) {
      toast.error("Failed to create checkout session");
      setIsLoadingPayment(false);
    }
  }, [amount, createCheckoutSession]);

  return (
    <div className="space-y-4">
      {!isLoadingBalance && balance !== null && (
        <div className="rounded-md border p-4">
          <p className="text-sm font-medium">
            Current Balance: ${balance.toFixed(2)}
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="amount">Amount</Label>
        <div className="mt-2 flex gap-2">
          {amountOptions.map((option) => (
            <Button
              key={option}
              variant={amount === option ? "default" : "outline"}
              onClick={() => {
                setAmount(option);
                setCustomAmount("");
              }}
            >
              ${option}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor="customAmount">Or enter custom amount:</Label>
          <input
            id="customAmount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={customAmount}
            onChange={handleCustomAmountChange}
            onBlur={handleCustomAmountBlur}
            className="w-20 rounded-md border p-2 text-sm"
            placeholder="Custom $"
          />
          {customAmount && (
            <p className="text-xs text-muted-foreground">
              Must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}
            </p>
          )}
        </div>
      </div>

      <Button
        onClick={handleCheckout}
        className="w-full"
        disabled={
          isLoadingPayment || amount < MIN_AMOUNT || amount > MAX_AMOUNT
        }
      >
        {isLoadingPayment ? "Processing..." : `Pay $${amount}`}
      </Button>
    </div>
  );
}
