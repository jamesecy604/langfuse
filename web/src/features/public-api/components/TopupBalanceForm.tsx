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

const CheckoutForm = ({
  amount,
  onSuccess,
}: {
  amount: number;
  onSuccess: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const session = useSession();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
          receipt_email: session.data?.user?.email ?? undefined,
        },
      });

      if (error) {
        toast.error(error.message || "Payment failed");
      } else {
        toast.success(`Payment of $${amount} processed successfully`);
        onSuccess();
      }
    } catch (error) {
      toast.error("Payment processing failed");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border p-4">
        <PaymentElement />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? "Processing..." : `Pay $${amount}`}
      </Button>
    </form>
  );
};

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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
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
          if (numValue >= MIN_AMOUNT && numValue <= MAX_AMOUNT) {
            setAmount(numValue);
          } else {
            toast.error(
              `Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}`,
            );
          }
        }
      }
    }
  };

  const { mutateAsync: createPaymentIntent } =
    api.payments.createPaymentIntent.useMutation();

  const fetchClientSecret = useCallback(async () => {
    try {
      const { clientSecret } = await createPaymentIntent({
        amount: amount * 100, // Convert to cents
      });
      return clientSecret;
    } catch (error) {
      toast.error("Failed to create payment intent");
      throw error;
    }
  }, [amount, createPaymentIntent]);

  useEffect(() => {
    const fetchSecret = async () => {
      setIsLoadingPayment(true);
      try {
        const secret = await fetchClientSecret();
        setClientSecret(secret);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoadingPayment(false);
      }
    };

    fetchSecret();
  }, [fetchClientSecret]);

  const handleSuccess = () => {
    onOpenChange(false);
  };

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

      {clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
            },
          }}
        >
          <CheckoutForm amount={amount} onSuccess={handleSuccess} />
        </Elements>
      )}
    </div>
  );
}
