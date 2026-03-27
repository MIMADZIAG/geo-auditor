import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PENDING_AUDIT_KEY } from "@/const";
import { toast } from "sonner";

/**
 * usePendingAudit
 *
 * After a successful OAuth login, this hook detects a pending audit URL stored
 * in sessionStorage (set by Home.tsx handleSubmit when the user was not yet
 * authenticated), automatically runs the audit, clears the storage entry, and
 * navigates to the results page.
 *
 * Must be mounted in a component that is rendered after authentication resolves
 * (i.e. after useAuth().isAuthenticated becomes true).
 *
 * @param isAuthenticated - current auth state from useAuth()
 */
export function usePendingAudit(isAuthenticated: boolean) {
  const [, navigate] = useLocation();
  const hasTriggered = useRef(false);

  const auditMutation = trpc.audit.run.useMutation({
    onSuccess: (data) => {
      navigate(`/results/${data.auditId}`);
    },
    onError: (err) => {
      toast.error(err.message || "Nie udało się uruchomić audytu. Spróbuj ponownie.");
    },
  });

  useEffect(() => {
    // Only run once per mount, only when authenticated
    if (!isAuthenticated) return;
    if (hasTriggered.current) return;

    const pendingUrl = sessionStorage.getItem(PENDING_AUDIT_KEY);
    if (!pendingUrl) return;

    // Mark as triggered immediately to prevent double-fire
    hasTriggered.current = true;
    sessionStorage.removeItem(PENDING_AUDIT_KEY);

    toast.success("Zalogowano! Uruchamiam audyt…", { duration: 3000 });
    auditMutation.mutate({ url: pendingUrl });
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isPending: auditMutation.isPending,
  };
}
