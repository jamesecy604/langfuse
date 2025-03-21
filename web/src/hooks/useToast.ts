import { toast } from "sonner";

type Toast = typeof toast;

export const useToast = (): { toast: Toast } => {
  return { toast };
};
