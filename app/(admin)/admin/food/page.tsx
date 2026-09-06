"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Utensils, CheckCircle2, AlertTriangle} from "lucide-react";
import { getMenuItems, deleteMenuItem } from "./actions";
import { FoodFilters } from "@/components/admin/food/FoodFilters";
import { AddFoodModal } from "@/components/admin/food/AddFoodModal";
import { EditFoodModal } from "@/components/admin/food/EditFoodModal";
import { FoodGrid } from "@/components/admin/food/FoodGrid";
import { MenuItem } from "@/lib/types/food";
import { toast } from "sonner";

export default function FoodPage() {
  const [isPending, startTransition] = useTransition();
  const [itemsArray, setItemsArray] = useState<MenuItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryTab, setCategoryTab] = useState("All Menu");
  const [statusFilter, setStatusFilter] = useState("All");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const fetchFreshItems = async () => {
    setIsLoadingData(true);
    try {
      const result = await getMenuItems();
      if (result.success) {
        setItemsArray(result.menuItems as MenuItem[] || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => { fetchFreshItems(); }, []);

  const filteredItems = useMemo(() => {
    return itemsArray.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const cat = String(item.category || "").toLowerCase();
      const status = String(item.status || "").toLowerCase();
      const search = searchQuery.toLowerCase().trim();

      const matchesSearch = search === "" || name.includes(search);
      const matchesCategory = categoryTab === "All Menu" || cat === categoryTab.toLowerCase().trim();
      const matchesStatus = statusFilter === "All" || status === statusFilter.toLowerCase().trim();

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [itemsArray, searchQuery, categoryTab, statusFilter]);

  const totalQuantity = useMemo(() => itemsArray.reduce((sum, i) => sum + (i.quantity || 0), 0), [itemsArray]);
  const activeCount = useMemo(() => itemsArray.filter(i => i.status === "available").length, [itemsArray]);
  const outOfStockCount = useMemo(() => itemsArray.filter(i => i.status === "out_of_stock").length, [itemsArray]);

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteMenuItem(id);
      if (res.success) {
        toast.success("Item Dissolved From Menu Pool");
        await fetchFreshItems();
      } else {
        toast.error("Operation Failed", { description: res.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 p-8 bg-[var(--background)] min-h-screen text-white animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">FOOD & BEVERAGE</h1>
          <p className="text-[#a1a1aa] text-sm">Manage kitchen operations and snack inventory pools.</p>
        </div>
        <AddFoodModal onFormSuccess={fetchFreshItems} open={isAddOpen} setOpen={setIsAddOpen} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: "Total Stock Volume", count: totalQuantity, sub: "Real-time kitchen bulk inventory", icon: Utensils },
          { title: "Active Live Menu Items", count: activeCount, sub: "Orderable floor assets", icon: CheckCircle2, color: "text-primary" },
          { title: "Out Of Stock Items", count: outOfStockCount, sub: "Requires batch ingredient logging", icon: AlertTriangle, color: "text-red-400" },
        ].map((stat) => (
          <Card key={stat.title} className="bg-[var(--surface)] border-[#27272a] hover:border-primary/70 hover:-translate-y-1 transition-all duration-500 group">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <stat.icon className="h-5 w-5 text-primary" />
              <span className="text-xs text-[#a1a1aa] uppercase tracking-wider">{stat.title}</span>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${stat.color || "text-white"}`}>{stat.count}</div>
              <p className="text-xs text-[#a1a1aa] mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <FoodFilters
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        categoryTab={categoryTab} setCategoryTab={setCategoryTab}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
      />

      <div className="mt-2">
        {isLoadingData ? (
          <div className="text-center py-12 bg-[var(--surface)] border border-[#27272a] rounded-xl text-[#a1a1aa] flex justify-center items-center gap-2">
            <BreakpointLoader size="sm" /> Loading café configuration tracks...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-[var(--surface)] border border-[#27272a] rounded-xl text-[#a1a1aa]">
            No menu elements map active filters.
          </div>
        ) : (
          <FoodGrid
            devices={filteredItems}
            onEdit={setEditingItem}
            onDelete={handleDelete}
            isPending={isPending}
            onRefreshData={fetchFreshItems}
          />
        )}
      </div>

      {editingItem && (
        <EditFoodModal item={editingItem} onFormSuccess={() => { setEditingItem(null); fetchFreshItems(); }} onClose={() => setEditingItem(null)} />
      )}
    </div>
  );
}
