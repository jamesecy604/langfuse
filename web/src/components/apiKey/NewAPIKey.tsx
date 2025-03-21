import { Input } from "../ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogHeader,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "../ui/form";

const apiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
  };
}

const defaultHeaders = {
  "Content-Type": "application/json",
};

const NewAPIKey = ({ onClose, onCreateSuccess }: NewAPIKeyProps) => {
  const [apiKey, setApiKey] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  const onNewAPIKey = (apiKey: string) => {
    setApiKey(apiKey);
    onCreateSuccess();
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose();
    setApiKey("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      {apiKey === "" ? (
        <CreateAPIKeyForm onNewAPIKey={onNewAPIKey} closeModal={handleClose} />
      ) : (
        <DisplayAPIKey apiKey={apiKey} closeModal={handleClose} />
      )}
    </Dialog>
  );
};

const CreateAPIKeyForm = ({
  onNewAPIKey,
  closeModal,
}: {
  onNewAPIKey: (apiKey: string) => void;
  closeModal: () => void;
}) => {
  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      name: "",
    },
  });

  const onSubmit = async (values: ApiKeyFormValues) => {
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to create API key");
      }

      const { data } = await response.json();
      if (data?.apiKey) {
        onNewAPIKey(data.apiKey);
      } else {
        throw new Error(data?.message || "Invalid response from server");
      }
    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error("Failed to create API key. Please try again.");
    }
  };

  return (
    <DialogContent>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              API keys allow you to authenticate with the API
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="My API Key"
                      className="text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeModal}>
              Close
            </Button>
            <Button
              type="submit"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Creating..." : "Create API Key"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
};

const DisplayAPIKey = ({ apiKey, closeModal }: DisplayAPIKeyProps) => {
  return (
    <>
      <DialogHeader>New API Key</DialogHeader>
      <DialogDescription>
        Make sure to copy your API key now. You won't be able to see it again!
      </DialogDescription>
      <DialogContent>
        <DialogTitle>Your New API Key</DialogTitle>
        <div className="space-y-4">
          <Input value={apiKey} className="text-sm" readOnly />
        </div>
      </DialogContent>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={closeModal}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
};

interface NewAPIKeyProps {
  onClose: () => void;
  onCreateSuccess: () => void;
}

interface DisplayAPIKeyProps {
  apiKey: string;
  closeModal: () => void;
}

export default NewAPIKey;
