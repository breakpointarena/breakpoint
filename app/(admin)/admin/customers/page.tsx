"use client";

import { useEffect, useState } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { getLiveCustomerRegistryAction } from "./actions";
import { CustomerTable } from "@/components/admin/customers/CustomerTable";
import { CustomerRow } from "@/lib/types/customers";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AdminCustomersDashboard() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCustomerDatabase();
  }, []);

  async function loadCustomerDatabase() {
    setLoading(true);
    setError(null);
    const res = await getLiveCustomerRegistryAction();
    if (res.error) {
      toast.error(res.error);
      setError(res.error);
    } else {
      setCustomers(res.data as CustomerRow[]);
    }
    setLoading(false);
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-white p-2 sm:p-6 animate-in fade-in duration-300">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-5">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Customer Directory
          </h1>
          <p className="text-description font-medium mt-0.5">
            Monitor registered players, search demographics info, and verify subscription tracks.
          </p>
        </div>
      </div>

      {error ? (
        <div className="h-48 w-full flex flex-col items-center justify-center gap-4 border border-red-900/20 rounded-xl bg-red-950/10">
          <div className="text-red-400 text-sm font-bold">Failed to load customers</div>
          <div className="text-min-enhanced text-secondary-content">{error}</div>
          <Button
            onClick={loadCustomerDatabase}
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-950/20"
          >
            Try Again
          </Button>
        </div>
      ) : loading ? (
        <div className="h-48 w-full flex items-center justify-center border border-zinc-900 rounded-xl bg-[var(--surface)]">
          <BreakpointLoader size="md" />
        </div>
      ) : (
        <CustomerTable customers={customers} />
      )}
    </div>
  );
}
