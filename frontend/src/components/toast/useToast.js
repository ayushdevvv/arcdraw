import { toast } from "./toastStore.js";

// Components call useToast() for the shared toast helpers.
export function useToast() {
  return toast;
}
