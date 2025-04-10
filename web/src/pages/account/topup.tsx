import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
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

  const fetchClientSecret = async () => {
    try {
      const { clientSecret } = await api.payments.createPaymentIntent.mutate({
        amount: amount * 100, // Convert to cents
      });
      return clientSecret;
    } catch (error) {
      toast.error("Failed to create payment intent");
      throw error;
    }
  };

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
          return_url: `${window.location.origin}/account`,
          receipt_email: session.data?.user?.email,
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

export default function TopupPage() {
  const [amount, setAmount] = useState<number>(amountOptions[0]);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);

  const { data: balanceData, isLoading: isBalanceLoading } =
    api.balance.getBalance.useQuery(undefined, {
      onSuccess: (data) => {
        setBalance(data.balance);
        setIsLoadingBalance(false);
      },
      onError: () => {
        setIsLoadingBalance(false);
      },
    });

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
  const router = useRouter();
  const session = useSession();

  const handleSuccess = () => {
    router.push("/account");
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">Top Up Your Account</h1>

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

        <Elements stripe={stripePromise} options={{ fetchClientSecret }}>
          <CheckoutForm amount={amount} onSuccess={handleSuccess} />
        </Elements>
      </div>
    </div>
  );
}
