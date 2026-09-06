"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { UploadCloud, Utensils, ImageIcon, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { updateMenuItem } from "@/app/(admin)/admin/food/actions";
import { uploadImage } from "@/lib/storage/imageUpload";
import { MenuItem, FoodCategory, FoodStatus } from "@/lib/types/food";
import { toast } from "sonner";
import { useRequiredFields } from "@/lib/hooks/useRequiredFields";

interface EditFoodModalProps {
  item: MenuItem;
  onFormSuccess: () => void;
  onClose: () => void;
}

export function EditFoodModal({ item, onFormSuccess, onClose }: EditFoodModalProps) {
  const [isPending, startTransition] = useTransition();
  const { formRef, isComplete, recheck } = useRequiredFields();

  const [previewName, setPreviewName] = useState(item.name || "");
  const [category, setCategory] = useState<FoodCategory>(item.category || "Snacks");
  const [price, setPrice] = useState(item.price || "");
  const [quantity, setQuantity] = useState(item.quantity || "0");
  const [status, setStatus] = useState<FoodStatus>(item.status || "available");
  const [description, setDescription] = useState(item.description || "");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Whether the admin asked for the saved picture to go.
   *
   * Kept apart from `localFile` because "no new file chosen" and "delete the one
   * on record" are different intentions that used to be indistinguishable - the
   * submit fell back to `item.image_url` either way, so a saved image could
   * never be taken off an item once it was on. Nothing is destroyed until the
   * form is applied, so Cancel still leaves the original picture in place.
   */
  const [imageRemoved, setImageRemoved] = useState(false);

  const objectUrl = useMemo(
    () => (localFile ? URL.createObjectURL(localFile) : null),
    [localFile]
  );

  // Only blob URLs are ours to revoke - the saved image is a plain remote URL.
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const filePreviewUrl = objectUrl ?? (imageRemoved ? null : item.image_url || null);

  /**
   * Drops the staged file and marks the saved one for deletion.
   *
   * Resetting the input matters as much as the state: it keeps the old filename
   * otherwise, so re-picking the *same* file would set an identical value, fire
   * no change event, and the picture would refuse to come back.
   */
  const clearImage = () => {
    setLocalFile(null);
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Writing to the input directly raises no change event, so the form's
    // onChange never fires and `isComplete` keeps whatever it last saw - which
    // left Apply stuck disabled after a removal. Nudge the check by hand.
    recheck();
  };

  const hasImage = Boolean(objectUrl) || (Boolean(item.image_url) && !imageRemoved);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetForm = e.currentTarget;

    startTransition(async () => {
      // Empty means "clear it" — the action stores that as NULL.
      let bucketUrl = imageRemoved ? "" : item.image_url || "";

      if (localFile) {
        const uploaded = await uploadImage('food-images', localFile);

        if ('error' in uploaded) {
          toast.error("Bucket upload error: " + uploaded.error);
          return;
        }

        bucketUrl = uploaded.url;
      }

      const submissionFormData = new FormData(targetForm);
      submissionFormData.set("id", item.id);
      submissionFormData.set("image_url", bucketUrl);
      submissionFormData.set("category", category);
      submissionFormData.set("status", status);

      const result = await updateMenuItem(submissionFormData);
      if (result.success) {
        toast.success("Configuration Corrected", {
          description: `${previewName || "Menu item"} configuration sync complete.`,
          icon: <CheckCircle2 className="h-5 w-5 text-primary" />
        });
        onFormSuccess();
      } else {
        toast.error("Update Failed", {
          description: result.error,
          icon: <AlertCircle className="h-5 w-5 text-[#f43f5e]" />
        });
      }
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[var(--background)] border-[#27272a] text-white max-w-[900px] w-[95vw] p-0 overflow-hidden shadow-2xl h-auto max-h-[90vh] flex flex-col justify-between">
        
        {/* Header Panel */}
        <div className="p-6 pr-14 border-b border-[#27272a]/70 bg-[var(--surface)] flex-shrink-0">
          <DialogTitle className="text-xl font-black tracking-tight text-white">Edit Food Configuration</DialogTitle>
          <p className="text-xs text-[#a1a1aa] mt-1">Override fields and live inventory stock limits</p>
        </div>

        <form ref={formRef} onChange={recheck} onSubmit={handleSubmit} className="flex-1 flex flex-col md:flex-row overflow-y-auto min-h-0">
          
          {/* Left Field Inputs Frame Grid */}
          <div className="flex-1 p-8 space-y-6 bg-[var(--background)] overflow-y-auto">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Item Name <span className="text-red-500">*</span></label>
                <Input 
                  name="name"
                  value={previewName} 
                  onChange={(e) => setPreviewName(e.target.value)} 
                  className="h-10 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Category <span className="text-red-500">*</span></label>
                <select 
                  name="category" 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value as FoodCategory)} 
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none text-white cursor-pointer transition-colors"
                >
                  <option value="Snacks">Snacks</option>
                  <option value="Drinks">Drinks</option>
                  <option value="Meals">Meals</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Price (₹) <span className="text-red-500">*</span></label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-[#a1a1aa] text-sm">₹</span>
                  </div>
                  <input 
                    type="number" 
                    name="price"
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] pl-7 pr-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors" 
                    required 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Current Batch Stock <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  name="quantity"
                  value={quantity} 
                  onChange={(e) => setQuantity(e.target.value)} 
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors" 
                  required 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Override Image Asset</label>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-[#27272a] border-dashed rounded-xl cursor-pointer bg-[var(--surface)] hover:bg-[#161616] hover:border-primary/40 transition-all group">
                <div className="flex items-center gap-3">
                  <UploadCloud className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                  <p className="text-xs text-[#a1a1aa] font-medium max-w-[280px] truncate">
                    {localFile ? localFile.name : "Select a file to upload custom update path"}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] || null;
                    setLocalFile(picked);
                    // Choosing a replacement supersedes an earlier removal.
                    if (picked) setImageRemoved(false);
                  }}
                />
              </label>

              {/* Outside the dropzone label on purpose — nested in it, a click
                  here would count as a click on the label and reopen the picker. */}
              {hasImage && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#27272a] bg-[var(--surface)] px-3 py-2">
                  <span className="text-xs text-[#a1a1aa] truncate">
                    {localFile ? localFile.name : "Current image"}
                  </span>
                  <button
                    type="button"
                    onClick={clearImage}
                    className="flex items-center gap-1 text-xs font-bold text-[#f43f5e] hover:text-[#fb7185] transition-colors flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              )}

              {imageRemoved && !localFile && (
                <p className="text-xs text-[#a1a1aa]">
                  Image will be removed when you apply. Cancel to keep it.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Operational Availability <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {['available', 'out_of_stock', 'hidden'].map((opt) => (
                  <label key={opt} className={`flex items-center justify-center cursor-pointer rounded-lg border py-2.5 text-xs font-bold transition-all ${status === opt ? 'border-primary bg-primary/10 text-primary' : 'border-[#27272a] bg-[var(--surface)] text-[#a1a1aa] hover:border-zinc-700'}`}>
                    <input type="radio" name="status_radio" value={opt} className="hidden" checked={status === opt} onChange={() => setStatus(opt as FoodStatus)} />
                    <span className="capitalize tracking-wide">{opt.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Description</label>
              <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary h-24 outline-none resize-none transition-colors" />
            </div>
          </div>

          {/* Right Static Preview Column — Non Scrolling */}
          {/* gap-6 rather than space-y-6: its `> * ~ *` rule outranks the footer's
              mt-auto, so the Cancel/Apply row was never pushed to the bottom but
              left in flow after the preview card. Paired with overflow-hidden on
              a column stretched to the left one's height, shortening that column
              - by removing the image row, say - clipped the buttons out of sight. */}
          <div className="w-full md:w-[350px] bg-[var(--surface)] border-l border-[#27272a]/70 p-6 flex flex-col justify-start gap-6 flex-shrink-0 select-none h-full md:sticky md:top-0">
            <div className="w-full text-center md:text-left flex-shrink-0">
              <p className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Adjusted Live Preview</p>
            </div>
            
            <div className="w-full flex-shrink-0 flex items-center justify-center">
              <Card className="bg-[var(--background)] border-[#27272a] overflow-hidden w-full max-w-[245px] shadow-2xl transition-all duration-300">
                <div className="h-32 w-full bg-[var(--background)] border-b border-[#27272a] flex items-center justify-center overflow-hidden relative">
                  {filePreviewUrl ? (
                    <img src={filePreviewUrl} alt="Preview display" className="w-full h-full object-cover animate-in fade-in duration-300" />
                  ) : (
                    <div className="flex flex-col items-center text-zinc-700 gap-1.5">
                      <ImageIcon className="h-5 w-5 text-muted-content" />
                      <span className="text-xs">No image asset mapped</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col space-y-3 bg-[var(--background)]">
                  <div className="flex justify-between items-start">
                    <div className="p-1.5 bg-[var(--surface-hover)] rounded-md border border-zinc-800"><Utensils className="h-4 w-4 text-primary" /></div>
                    <PreviewFoodBadge previewStatus={status} />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-base font-black text-white tracking-tight truncate">{previewName || "FOOD ITEM TITLE"}</h3>
                    <p className="text-[#a1a1aa] text-xs flex items-center gap-1.5 truncate"><span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"></span>{category}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-900/60 pt-2 text-xs">
                    <span className="text-[#a1a1aa] font-medium">Menu Price</span>
                    <span className="font-bold text-primary text-sm">₹{price || "0"}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-900/40 pt-2 text-xs">
                    <span className="text-[#a1a1aa] font-medium">Stock Pool</span>
                    <span className="font-bold text-white text-sm">{quantity || "0"} Units</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Form control override submit footer layout alignment */}
            <div className="w-full flex justify-end gap-3 pt-6 border-t border-[#27272a]/40 flex-shrink-0 mt-auto">
              <Button type="button" variant="ghost" className="text-[#a1a1aa] hover:bg-zinc-900 hover:text-white transition-colors text-xs font-semibold" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending || !isComplete} className="disabled:opacity-50 disabled:pointer-events-none bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-bold px-5 h-9 text-xs rounded-md shadow-md transition-all flex items-center justify-center gap-1.5">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply Overrides"}
              </Button>
            </div>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewFoodBadge({ previewStatus }: { previewStatus: string }) {
  if (previewStatus === 'available') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-primary border border-primary/30 rounded uppercase bg-primary/5">Available</span>;
  if (previewStatus === 'out_of_stock') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#f43f5e] border border-[#f43f5e]/30 rounded uppercase bg-[#f43f5e]/5">Out of Stock</span>;
  return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-secondary-content border border-zinc-800 rounded uppercase bg-zinc-900">Hidden</span>;
}