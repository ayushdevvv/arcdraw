import { useCallback, useEffect, useState } from "react";

/**
 * Subscribe to account-gate requests emitted by requireAccountForAction().
 * The app shell renders the account-required modal from pendingAction.
 */
export function useAccountGate() {
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    const handleAccountRequired = (event) => {
      setPendingAction(event.detail?.action || "account-required");
    };

    window.addEventListener("arcdraw:account-required", handleAccountRequired);
    return () => window.removeEventListener("arcdraw:account-required", handleAccountRequired);
  }, []);

  const dismiss = useCallback(() => setPendingAction(null), []);

  return { pendingAction, isAccountRequired: Boolean(pendingAction), dismiss };
}
