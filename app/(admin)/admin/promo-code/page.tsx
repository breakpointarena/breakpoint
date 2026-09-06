"use client";

import { useEffect, useState } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { getLivePromoListAction, executePromoDeletionAction } from "./actions";
import { PromoCodeTable } from "@/components/admin/promo-code/PromoCodeTable";
import { AddPromoCodeModal } from "@/components/admin/promo-code/AddPromoCodeModal";
import { EditPromoCodeModal } from "@/components/admin/promo-code/EditPromoCodeModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromoCodeRow } from "@/lib/types/promo-code";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminPromoCodeDashboard() {
  const [promos, setPromos] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<PromoCodeRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    loadPromoInventoryGrid();
  }, []);

  async function loadPromoInventoryGrid() {
    setLoading(true);
    setError(null);
    const res = await getLivePromoListAction();
    if (res.error) {
      toast.error(res.error);
      setError(res.error);
    } else {
      setPromos(res.data as PromoCodeRow[]);
    }
    setLoading(false);
  }

  const handleOpenEditModal = (target: PromoCodeRow) => {
    setSelectedPromo(target);
    setIsEditOpen(true);
  };

  const handleTriggerDelete = (id: number) => {
    setDeleteId(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;

    const res = await executePromoDeletionAction(deleteId);
    if (res.success) {
      toast.success("Promo code deleted successfully.");
      loadPromoInventoryGrid();
    } else {
      toast.error(res.error);
    }
    setDeleteId(null);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-white p-2 sm:p-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-5">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Promo Code Management</h1>
          <p className="text-sm text-secondary-content font-medium mt-0.5">Configure and monitor structural discount campaigns across the arena platform stores.</p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          variant="gradient"
          className="font-black uppercase text-sm h-11 px-5 rounded-lg tracking-wider flex items-center gap-2"
        >
          <PlusCircle className="h-4 w-4 stroke-[3]" /> Create Promo Code
        </Button>
      </div>

      {error ? (
        <div className="h-48 w-full flex flex-col items-center justify-center gap-4 border border-red-900/20 rounded-xl bg-red-950/10">
          <div className="text-red-400 text-sm font-bold">Failed to load promo codes</div>
          <div className="text-sm text-secondary-content">{error}</div>
          <Button
            onClick={loadPromoInventoryGrid}
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
        <PromoCodeTable
          promos={promos}
          onEdit={handleOpenEditModal}
          onDelete={handleTriggerDelete}
          onAdd={() => setIsAddOpen(true)}
        />
      )}

      {isAddOpen && (
        <AddPromoCodeModal 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)} 
          onRefresh={loadPromoInventoryGrid} 
        />
      )}

      {isEditOpen && selectedPromo && (
        <EditPromoCodeModal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setSelectedPromo(null);
          }}
          editingPromo={selectedPromo}
          onRefresh={loadPromoInventoryGrid}
        />
      )}

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setDeleteId(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Promo Code"
        description="Are you sure you want to permanently delete this promo code? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
