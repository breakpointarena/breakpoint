"use client";

import { useState, useMemo, useEffect } from "react";
import { CustomerRow } from "@/lib/types/customers";
import { AddCustomerSubscriptionModal } from "@/components/admin/customers/AddCustomerSubscriptionModal";
import { RemoveCustomerHourPackButton } from "@/components/admin/customers/RemoveCustomerHourPackButton";
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
  X
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface CustomerTableProps {
  customers: CustomerRow[];
  onSubscriptionAssigned: () => Promise<void>;
}

type SortField = "name" | "phone" | "email" | "created_at" | "date_of_birth";
type SortOrder = "asc" | "desc" | null;

export function CustomerTable({ customers, onSubscriptionAssigned }: CustomerTableProps) {
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
    <div className="space-y-4">
      {/* Filters and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-content" />
          <Input
            placeholder="Search by name, phone, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-[var(--background)] border-zinc-800 text-white text-sm h-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-content hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Membership Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-secondary-content" />
          <div className="flex gap-2">
            {[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "none", label: "No Plan" }
            ].map((filter) => (
              <Button
                key={filter.value}
                onClick={() => setMembershipFilter(filter.value as any)}
                size="sm"
                className={`text-min-enhanced font-black uppercase h-8 transition-all duration-300 ${
                  membershipFilter === filter.value
                    ? "bg-gradient-primary text-[var(--button-text)] glow-box"
                    : "bg-[var(--surface)] text-muted-content hover:bg-[var(--surface-hover)] hover:text-white border border-[#27272a]"
                }`}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="text-min-enhanced text-secondary-content font-bold">
          Showing {filteredAndSortedCustomers.length} of {customers.length} customers
        </div>
      </div>

      {filteredAndSortedCustomers.length === 0 ? (
        <div className="p-12 text-center text-sm font-semibold text-muted-content border border-zinc-900 rounded-2xl bg-[#09090b]">
          No customers found matching your filters.
        </div>
      ) : (
        <>
          <Card className="bg-[#0c0c0e]/40 border-zinc-900 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.6)] w-full overflow-x-auto p-1">
          <table className="w-full text-left border-collapse text-sm table-fixed">
            <thead>
              <tr className="border-b border-zinc-900 bg-[var(--background)]/20 text-label-enhanced select-none">
                <th className="p-4 w-[24%]">
                  <button
                    onClick={() => handleSort("name")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Customer
                    <SortIcon field="name" />
                  </button>
                </th>
                <th className="p-4 w-[23%]">
                  <button
                    onClick={() => handleSort("phone")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Contact
                    <SortIcon field="phone" />
                  </button>
                </th>
                <th className="p-4 w-[18%]">Membership</th>
                <th className="p-4 w-[24%]">Hour Packs</th>
                <th className="p-4 hidden xl:table-cell w-[11%] text-right">
                  <button
                    onClick={() => handleSort("created_at")}
                    className="flex items-center gap-2 hover:text-primary transition-colors ml-auto"
                  >
                    Our Customer From
                    <SortIcon field="created_at" />
                  </button>
                </th>
              </tr>
            </thead>
        <tbody className="divide-y divide-zinc-900/40 font-medium">
          {paginatedCustomers.map((row) => {
            const hasSub = !!row.subscription_name;
            const isActive = row.subscription_status === "active";
            const hourPacks = Array.isArray(row.hour_packs) ? row.hour_packs : [];
 
            return (
              <tr key={row.id} className="group hover:bg-[var(--background)]/40 transition-all duration-200 border-l-2 border-transparent hover:border-l-primary">
 
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
                      <span className="min-w-0 break-words">{row.subscription_name}</span>
                    </span>
                  ) : (
                    <span className="bg-[var(--background)]/80 text-red-400 border border-zinc-900 text-[11px] font-black px-2.5 py-1 rounded-lg uppercase whitespace-nowrap">No Plan Active</span>
                  )}
                  <AddCustomerSubscriptionModal
                    customer={{ id: row.id, name: row.name }}
                    onAssigned={onSubscriptionAssigned}
                  />
                </td>

                <td className="p-4">
                  {hourPacks.length > 0 ? (
                    <div className="space-y-2.5">
                      {hourPacks.map((pass) => {
                        const hours = Math.floor(pass.remaining_minutes / 60);
                        const minutes = pass.remaining_minutes % 60;
                        const totalMinutes = pass.hours_included * 60;
                        const remainingPercent = totalMinutes > 0
                          ? Math.min(100, Math.max(0, (pass.remaining_minutes / totalMinutes) * 100))
                          : 0;
                        return (
                          <div key={pass.id} className="rounded-xl border border-cyan-950/70 bg-cyan-950/15 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="break-words text-xs font-bold text-zinc-100 [overflow-wrap:anywhere]">
                                  {pass.name}
                                </p>
                                <span className="mt-1 inline-flex max-w-full rounded-full border border-cyan-800/50 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                                  {pass.device_type_name || "Legacy universal"}
                                </span>
                              </div>
                              <RemoveCustomerHourPackButton
                                customerId={row.id}
                                customerName={row.name}
                                subscriptionId={pass.id}
                                packName={pass.name}
                                onRemoved={onSubscriptionAssigned}
                              />
                            </div>
                            <div className="mt-3 flex items-baseline justify-between gap-2">
                              <p className="text-lg font-black leading-none text-cyan-300">
                                {hours}<span className="ml-1 text-xs font-bold text-cyan-200">h</span>
                                {minutes > 0 && <> {minutes}<span className="ml-1 text-xs font-bold text-cyan-200">m</span></>}
                              </p>
                              <p className="text-[10px] text-zinc-500">
                                of {pass.hours_included}h total
                              </p>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={`${pass.name} time remaining`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(remainingPercent)}
                              className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"
                            >
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-300 transition-all"
                                style={{ width: `${remainingPercent}%` }}
                              />
                            </div>
                            <p className="mt-2 text-[10px] font-medium text-zinc-500">
                              Expires {format(new Date(`${pass.end_date}T00:00:00`), "dd MMM yyyy")}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">No active balance</span>
                  )}
                </td>
 
                {/* Our Customer From */}
                <td className="p-4 hidden xl:table-cell text-right font-mono">
                  <div className="flex flex-col items-end">
                    <span className="text-[13px] text-white font-bold">
                      {row.created_at ? format(new Date(row.created_at), "dd MMM yy") : "N/A"}
                    </span>
                    <span className="text-label-enhanced">
                      {row.created_at ? format(new Date(row.created_at), "hh:mm a") : ""}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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