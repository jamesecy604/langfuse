import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Copy } from "lucide-react";

interface CopyToClipboardButtonProps {
  value: () => Promise<string>;
  onCopy?: () => void;
  onError?: () => void;
}

const CopyToClipboardButton = ({
  value,
  onCopy,
  onError,
}: CopyToClipboardButtonProps) => {
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    try {
      setIsCopying(true);
      const text = await value();
      await navigator.clipboard.writeText(text);
      onCopy?.();
      toast.success("Copied to clipboard");
    } catch (error) {
      console.error("Failed to copy:", error);
      onError?.();
      toast.error("Failed to copy");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} disabled={isCopying}>
      <Copy className="h-4 w-4" />
    </Button>
  );
};

export default CopyToClipboardButton;
