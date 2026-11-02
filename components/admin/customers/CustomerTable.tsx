"use client";

import { useState, useMemo, useEffect } from "react";
import { CustomerRow } from "@/lib/types/customers";
import { AddCustomerSubscriptionModal } from "@/components/admin/customers/AddCustomerSubscriptionModal";
import { AddWalletCreditButton } from "@/components/admin/customers/AddWalletCreditButton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  ShieldCheck,
  Mail,
  Phone,
  User,
  Cake,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Filter,
  X,
  SearchX,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface CustomerTableProps {
  customers: CustomerRow[];
  onSubscriptionAssigned: () => Promise<void>;
  canAdjustWallet: boolean;
}

type SortField = "name" | "phone" | "email" | "created_at" | "date_of_birth";
type SortOrder = "asc" | "desc" | null;

export function CustomerTable({ customers, onSubscriptionAssigned, canAdjustWallet }: CustomerTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [membershipFilter, setMembershipFilter] = useState<"all" | "active" | "inactive" | "none">("all");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Reset current page when filter criteria changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, membershipFilter, sortField, sortOrder]);

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortOrder === "asc") setSortOrder("desc");
      else if (sortOrder === "desc") {
        setSortOrder(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = customers.filter((customer) => {
      // Search filter
      const matchesSearch =
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone.includes(searchQuery) ||
        (customer.email && customer.email.toLowerCase().includes(searchQuery.toLowerCase()));

      // Membership filter
      const hasSub = !!customer.subscription_name;
      const isActive = customer.subscription_status === "active";
      let matchesMembership = true;

      if (membershipFilter === "active") matchesMembership = hasSub && isActive;
      else if (membershipFilter === "inactive") matchesMembership = hasSub && !isActive;
      else if (membershipFilter === "none") matchesMembership = !hasSub;

      return matchesSearch && matchesMembership;
    });

    // Sort
    if (sortField && sortOrder) {
      filtered.sort((a, b) => {
        let aVal: any = a[sortField];
        let bVal: any = b[sortField];

        // Handle null/undefined
        if (!aVal && !bVal) return 0;
        if (!aVal) return sortOrder === "asc" ? 1 : -1;
        if (!bVal) return sortOrder === "asc" ? -1 : 1;

        // Convert to comparable values
        if (sortField === "created_at" || sortField === "date_of_birth") {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        } else {
          aVal = String(aVal).toLowerCase();
          bVal = String(bVal).toLowerCase();
        }

        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [customers, searchQuery, sortField, sortOrder, membershipFilter]);

  const totalPages = Math.ceil(filteredAndSortedCustomers.length / ITEMS_PER_PAGE);
  const activeMembershipCount = customers.filter(customer => customer.subscription_status === "active").length;
  const inactiveMembershipCount = customers.filter(customer => customer.subscription_status === "expired").length;
  const noMembershipCount = customers.length - activeMembershipCount - inactiveMembershipCount;

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedCustomers, currentPage]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-content" />;
    if (sortOrder === "asc") return <ArrowUp className="h-3 w-3 text-primary" />;
    return <ArrowDown className="h-3 w-3 text-primary" />;
  };
  if (customers.length === 0) {
    return (
      <div className="p-12 text-center text-sm-enhanced border border-zinc-900 rounded-2xl bg-[#09090b]">
        No customer profile matches found in records registry.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total customers", value: customers.length, icon: User, tone: "text-primary" },
          { label: "Active memberships", value: activeMembershipCount, icon: ShieldCheck, tone: "text-emerald-400" },
          { label: "No active membership", value: noMembershipCount, icon: ShieldAlert, tone: "text-zinc-400" },
        ].map(stat => (
          <Card key={stat.label} className="flex items-center gap-4 rounded-xl border-zinc-800/80 bg-zinc-950/70 p-4 shadow-none">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 ${stat.tone}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black leading-none text-white">{stat.value.toLocaleString("en-IN")}</p>
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl border-zinc-800/80 bg-zinc-950/70 p-4 shadow-none">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              aria-label="Search customers"
              placeholder="Search name, phone, or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 border-zinc-800 bg-zinc-900/80 pl-10 pr-10 text-sm text-white placeholder:text-zinc-600 focus-visible:border-primary/60"
            />
            {searchQuery && (
              <button
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
              <Filter className="h-4 w-4" /> Membership
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Expired" },
                { value: "none", label: "None" }
              ].map((filter) => (
                <Button
                  key={filter.value}
                  onClick={() => setMembershipFilter(filter.value as any)}
                  size="sm"
                  aria-pressed={membershipFilter === filter.value}
                  className={`h-9 rounded-lg px-3 text-xs font-bold transition ${
                    membershipFilter === filter.value
                      ? "border border-primary/50 bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.08)]"
                      : "border border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-white"
                  }`}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            <p className="text-xs font-semibold text-zinc-500 sm:ml-2">
              {filteredAndSortedCustomers.length} of {customers.length} customers
            </p>
          </div>
        </div>
      </Card>

      {filteredAndSortedCustomers.length === 0 ? (
        <Card className="flex flex-col items-center rounded-2xl border-zinc-800 bg-zinc-950/70 px-6 py-14 text-center shadow-none">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-500">
            <SearchX className="h-5 w-5" />
          </div>
          <h2 className="text-base font-black text-white">No matching customers</h2>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">Change your search or membership filter to see more results.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5"
            onClick={() => { setSearchQuery(""); setMembershipFilter("all"); }}
          >
            Clear filters
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {paginatedCustomers.map(row => {
              const hasSub = !!row.subscription_name;
              const isActive = row.subscription_status === "active";
              return (
                <Card key={row.id} className="rounded-2xl border-zinc-800/80 bg-zinc-950/70 p-4 shadow-none">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-primary">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-black text-white">{row.name}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                          <Cake className="h-3.5 w-3.5 text-primary/80" />
                          {row.date_of_birth ? format(new Date(row.date_of_birth), "dd MMM yyyy") : "Date of birth not set"}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                      isActive
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}>
                      {isActive ? "Active" : hasSub ? "Expired" : "No plan"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-zinc-800/80 pt-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 break-all font-mono">{row.phone}</span>
                      <button
                        aria-label={`Copy phone number for ${row.name}`}
                        onClick={() => handleCopy(row.phone, `phone-${row.id}`)}
                        className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                      >
                        {copiedField === `phone-${row.id}` ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                      <span className="min-w-0 break-all">{row.email || "No email"}</span>
                    </div>
                    {hasSub && (
                      <p className="pl-5 text-xs font-semibold text-zinc-400">
                        {row.subscription_name}{row.expiry_date ? ` · until ${format(new Date(`${row.expiry_date}T00:00:00`), "dd MMM yyyy")}` : ""}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                      <span>Wallet</span>
                      <span className="font-mono text-sm font-bold text-white">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(row.wallet_balance || 0))}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-3">
                    <AddCustomerSubscriptionModal
                      customer={{ id: row.id, name: row.name }}
                      onAssigned={onSubscriptionAssigned}
                    />
                    {canAdjustWallet && <AddWalletCreditButton customer={{ id: row.id, name: row.name }} onCredited={onSubscriptionAssigned} />}
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    Customer since {row.created_at ? format(new Date(row.created_at), "dd MMM yyyy") : "—"}
                  </p>
                </Card>
              );
            })}
          </div>

          <Card className="hidden w-full overflow-hidden rounded-2xl border-zinc-800/80 bg-zinc-950/60 p-0 shadow-[0_16px_50px_rgba(0,0,0,0.22)] md:block">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/55 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500 select-none">
                <th className="p-4 w-[22%]">
                  <button
                    onClick={() => handleSort("name")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Customer
                    <SortIcon field="name" />
                  </button>
                </th>
                <th className="p-4 w-[21%]">
                  <button
                    onClick={() => handleSort("phone")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Contact
                    <SortIcon field="phone" />
                  </button>
                </th>
                <th className="p-4 w-[17%]">Membership</th>
                <th className="p-4 w-[13%]">Wallet</th>
                <th className="p-4 w-[12%] text-right">
                  <button
                    onClick={() => handleSort("created_at")}
                    className="flex items-center gap-2 hover:text-primary transition-colors ml-auto"
                  >
                    Our Customer From
                    <SortIcon field="created_at" />
                  </button>
                </th>
                <th className="p-4 w-[15%] text-right">Actions</th>
              </tr>
            </thead>
        <tbody className="divide-y divide-zinc-800/60 font-medium">
          {paginatedCustomers.map((row) => {
            const hasSub = !!row.subscription_name;
            const isActive = row.subscription_status === "active";
 
            return (
              <tr key={row.id} className="group transition-colors hover:bg-white/[0.025]">
 
                {/* Customer Details Name Block */}
                <td className="p-4 tracking-wide">
                  {/* flex lives on an inner div: `display:flex` on a <td> drops it out of the
                      table's column layout, so it stops honouring the fixed column width */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-muted-content group-hover:border-primary/50 group-hover:bg-primary/5 transition-all duration-200 shadow-inner flex-shrink-0">
                      <User className="h-4 w-4 text-primary transition-colors" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p
                        title={row.name}
                        className="text-zinc-100 group-hover:text-primary transition-colors font-black text-[15px] tracking-normal break-words [overflow-wrap:anywhere]"
                      >
                        {row.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs font-medium tracking-normal text-zinc-500">
                        <Cake className="h-3.5 w-3.5 flex-shrink-0 text-primary/80" />
                        <span>
                          {row.date_of_birth ? format(new Date(row.date_of_birth), "dd MMM yyyy") : "Date of birth not set"}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
 
                <td className="p-4">
                  <div className="space-y-2">
                    <div className="flex min-w-0 items-center gap-2 group/phone">
                      <Phone className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="min-w-0 break-all font-mono text-sm font-bold tracking-wide text-zinc-200">{row.phone}</span>
                      <button
                        aria-label={`Copy phone number for ${row.name}`}
                        onClick={() => handleCopy(row.phone, `phone-${row.id}`)}
                        className="ml-auto flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-zinc-800 group-hover/phone:opacity-100"
                      >
                        {copiedField === `phone-${row.id}` ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-secondary-content hover:text-primary" />
                        )}
                      </button>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 group/email">
                      <Mail className="h-4 w-4 flex-shrink-0 text-primary/80" />
                      <span
                        title={row.email ?? undefined}
                        className="min-w-0 break-words text-xs font-medium text-zinc-400 [overflow-wrap:anywhere]"
                      >
                        {row.email || "No email"}
                      </span>
                      {row.email && (
                        <button
                          aria-label={`Copy email address for ${row.name}`}
                          onClick={() => handleCopy(row.email!, `email-${row.id}`)}
                          className="ml-auto flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-zinc-800 group-hover/email:opacity-100"
                        >
                          {copiedField === `email-${row.id}` ? (
                            <Check className="h-3.5 w-3.5 text-green-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-secondary-content hover:text-primary" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </td>
 
                {/* Membership Track */}
                <td className="p-4 overflow-hidden">
                  {hasSub ? (
                    /* Keep plan names inside their column while allowing them to wrap. */
                    <span
                      title={row.subscription_name ?? undefined}
                      className={`inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 border text-[11px] font-black uppercase rounded-lg tracking-wide leading-tight ${isActive ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-zinc-900 text-secondary-content border-zinc-800"}`}
                    >
                      {isActive ? <ShieldCheck className="h-3 w-3 flex-shrink-0" /> : <ShieldAlert className="h-3 w-3 flex-shrink-0" />}
                      {/* wraps rather than truncates, so a long plan name stays fully readable */}
                      <span className="min-w-0 break-words">{row.subscription_name?.toLowerCase().includes("membership") ? row.subscription_name : `${row.subscription_name} Membership`}</span>
                    </span>
                  ) : (
                    <span className="bg-[var(--background)]/80 text-red-400 border border-zinc-900 text-[11px] font-black px-2.5 py-1 rounded-lg uppercase whitespace-nowrap">No Plan Active</span>
                  )}
                </td>
                <td className="p-4">
                  <span className="font-mono text-sm font-bold text-white">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(row.wallet_balance || 0))}</span>
                </td>
                {/* Our Customer From */}
                <td className="p-4 text-right font-mono">
                  <div className="flex flex-col items-end">
                    <span className="text-[13px] text-white font-bold">
                      {row.created_at ? format(new Date(row.created_at), "dd MMM yy") : "N/A"}
                    </span>
                    <span className="text-label-enhanced">
                      {row.created_at ? format(new Date(row.created_at), "hh:mm a") : ""}
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <AddCustomerSubscriptionModal
                      customer={{ id: row.id, name: row.name }}
                      onAssigned={onSubscriptionAssigned}
                    />
                    {canAdjustWallet && <AddWalletCreditButton customer={{ id: row.id, name: row.name }} onCredited={onSubscriptionAssigned} />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
          </div>
    </Card>

    {/* Pagination Controls */}
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-900/60 pt-4 px-2 select-none">
      <div className="text-xs text-secondary-content font-bold">
        Showing page {currentPage} of {Math.max(1, totalPages)} ({filteredAndSortedCustomers.length} total customers)
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage === 1 || totalPages <= 1}
          className="bg-[var(--surface)] text-white border-zinc-800 hover:bg-zinc-800 disabled:opacity-30 text-xs font-black uppercase h-8"
        >
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {totalPages <= 1 ? (
            <Button
              variant="default"
              size="sm"
              disabled
              className="h-8 w-8 text-xs font-black p-0 bg-gradient-primary text-[var(--button-text)] shadow-[0_0_12px_rgba(var(--primary-rgb),0.2)] opacity-50"
            >
              1
            </Button>
          ) : (
            Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              if (
                pageNum === 1 ||
                pageNum === totalPages ||
                Math.abs(pageNum - currentPage) <= 1
              ) {
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 text-xs font-black p-0 transition-all duration-200 ${
                      currentPage === pageNum
                        ? "bg-gradient-primary text-[var(--button-text)] shadow-[0_0_12px_rgba(var(--primary-rgb),0.2)]"
                        : "bg-[var(--surface)] text-zinc-400 hover:text-white border-zinc-800"
                    }`}
                  >
                    {pageNum}
                  </Button>
                );
              }
              if (
                (pageNum === 2 && currentPage > 3) ||
                (pageNum === totalPages - 1 && currentPage < totalPages - 2)
              ) {
                return (
                  <span key={pageNum} className="text-zinc-400 px-1 text-xs select-none">
                    ...
                  </span>
                );
              }
              return null;
            })
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages || totalPages <= 1}
          className="bg-[var(--surface)] text-white border-zinc-800 hover:bg-zinc-800 disabled:opacity-30 text-xs font-black uppercase h-8"
        >
          Next
        </Button>
      </div>
    </div>
        </>
      )}
    </div>
  );
}
