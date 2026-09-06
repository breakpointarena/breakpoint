"use client";

import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal } from "lucide-react";

interface FoodFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categoryTab: string;
  setCategoryTab: (tab: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
}

export function FoodFilters({
  searchQuery,
  setSearchQuery,
  categoryTab,
  setCategoryTab,
  statusFilter,
  setStatusFilter,
}: FoodFiltersProps) {
  const categories = ["All Menu", "Snacks", "Drinks", "Meals"];

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-[var(--surface)] border border-[#27272a]/60 p-4 rounded-xl">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-content" />
        <Input
          type="text"
          placeholder="Search orders or menu items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10 bg-[var(--background)] border-[#27272a] text-white placeholder:text-muted-content focus-visible:ring-primary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-[var(--background)] border border-[#27272a] p-1 rounded-lg">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryTab(cat)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                categoryTab === cat ? "bg-primary text-black" : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              {cat === "All Menu" ? "All" : cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-[var(--background)] border border-[#27272a] px-3 h-10 rounded-lg">
          <SlidersHorizontal className="h-3.5 w-3.5 text-secondary-content" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-xs font-bold text-[#a1a1aa] outline-none cursor-pointer pr-2 h-full uppercase tracking-wider"
          >
            <option value="All" className="bg-[var(--surface)]">All Status</option>
            <option value="Available" className="bg-[var(--surface)]">Available</option>
            <option value="Out_of_Stock" className="bg-[var(--surface)]">Out of Stock</option>
            <option value="Hidden" className="bg-[var(--surface)]">Hidden</option>
          </select>
        </div>
      </div>
    </div>
  );
}