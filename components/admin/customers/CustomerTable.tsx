"use client";

import { useState, useMemo, useEffect } from "react";
import { CustomerRow } from "@/lib/types/customers";
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
}

type SortField = "name" | "phone" | "email" | "created_at" | "date_of_birth";
type SortOrder = "asc" | "desc" | null;

export function CustomerTable({ customers }: CustomerTableProps) {
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
                <th className="p-4 w-[17%]">
                  <button
                    onClick={() => handleSort("name")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Customer Profile
                    <SortIcon field="name" />
                  </button>
                </th>
                <th className="p-4 w-[14%]">
                  <button
                    onClick={() => handleSort("phone")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Phone Terminal
                    <SortIcon field="phone" />
                  </button>
                </th>
                <th className="p-4 hidden lg:table-cell w-[12%]">
                  <button
                    onClick={() => handleSort("date_of_birth")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Date of Birth
                    <SortIcon field="date_of_birth" />
                  </button>
                </th>
                <th className="p-4 hidden md:table-cell w-[18%]">
                  <button
                    onClick={() => handleSort("email")}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Email Address
                    <SortIcon field="email" />
                  </button>
                </th>
                <th className="p-4 w-[19%]">Membership</th>
                <th className="p-4 hidden lg:table-cell w-[9%] text-right">Expiration</th>
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
 
            return (
              <tr key={row.id} className="group hover:bg-[var(--background)]/40 transition-all duration-200 border-l-2 border-transparent hover:border-l-primary">
 
                {/* Customer Details Name Block */}
                <td className="p-4 font-black tracking-wide">
                  {/* flex lives on an inner div: `display:flex` on a <td> drops it out of the
                      table's column layout, so it stops honouring the fixed column width */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-muted-content group-hover:border-primary/50 group-hover:bg-primary/5 transition-all duration-200 shadow-inner flex-shrink-0">
                      <User className="h-4 w-4 text-primary transition-colors" />
                    </div>
                    {/* Wraps rather than truncating: this is the directory staff read
                        names from, so an ellipsis hides the part they need. The column
                        is fixed-width, so a long name grows the row instead of the
                        column and cannot push the other columns out of line.
                        `break-all` is the fallback for a single unbroken run of
                        characters with nowhere to wrap. */}
                    <span
                      title={row.name}
                      className="text-zinc-200 group-hover:text-primary transition-colors font-black text-[15px] tracking-normal break-words [overflow-wrap:anywhere]"
                    >
                      {row.name}
                    </span>
                  </div>
                </td>
 
                {/* Phone Terminal Output */}
                <td className="p-4 text-zinc-300 font-mono tracking-wider">
                  <div className="flex items-center gap-2 group/phone">
                    <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-bold text-zinc-300 text-sm">{row.phone}</span>
                    <button
                      onClick={() => handleCopy(row.phone, `phone-${row.id}`)}
                      className="ml-auto opacity-0 group-hover/phone:opacity-100 transition-opacity p-1 hover:bg-zinc-800 rounded"
                    >
                      {copiedField === `phone-${row.id}` ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-secondary-content hover:text-primary" />
                      )}
                    </button>
                  </div>
                </td>
 
                {/* Date of Birth Block */}
                <td className="p-4 hidden lg:table-cell text-zinc-300 font-mono tracking-wider">
                  <div className="flex items-center gap-2">
                    <Cake className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-bold text-zinc-300 text-[13px]">
                      {row.date_of_birth ? format(new Date(row.date_of_birth), "dd MMM yyyy") : "—"}
                    </span>
                  </div>
                </td>
 
                {/* Email Address Block */}
                <td className="p-4 hidden md:table-cell text-muted-content font-medium">
                  <div className="flex items-center gap-2 group/email">
                    <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                    <span title={row.email ?? undefined} className="truncate text-muted-content text-sm">{row.email || "No mail configured"}</span>
                    {row.email && (
                      <button
                        onClick={() => handleCopy(row.email!, `email-${row.id}`)}
                        className="ml-auto opacity-0 group-hover/email:opacity-100 transition-opacity p-1 hover:bg-zinc-800 rounded flex-shrink-0"
                      >
                        {copiedField === `email-${row.id}` ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-secondary-content hover:text-primary" />
                        )}
                      </button>
                    )}
                  </div>
                </td>
 
                {/* Membership Track */}
                <td className="p-4 overflow-hidden">
                  {hasSub ? (
                    /* Plan names are free text, so the badge caps at the column width and
                       truncates instead of spilling over the Expiration column */
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
                </td>
 
                {/* Expiration Date */}
                <td className="p-4 hidden lg:table-cell text-right font-mono text-[13px]">
                  {row.expiry_date ? (
                    <span className={isActive ? "text-primary font-bold" : "text-muted-content line-through"}>
                      {format(new Date(row.expiry_date), "dd/MM/yy")}
                    </span>
                  ) : "—"}
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