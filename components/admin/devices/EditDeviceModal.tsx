"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Gamepad2, ImageIcon, Loader2, CheckCircle2, AlertCircle, UploadCloud, X } from "lucide-react";
import { updateDevice } from "@/app/(admin)/admin/devices/actions";
import { uploadImage } from "@/lib/storage/imageUpload";
import { toast } from "sonner";
import { useRequiredFields } from "@/lib/hooks/useRequiredFields";
import { MANUAL_DEVICE_STATUSES } from "@/lib/types/devices";

interface EditModalProps {
  device: any;
  onFormSuccess: () => void;
  onClose: () => void;
}

export function EditDeviceModal({ device, onFormSuccess, onClose }: EditModalProps) {
  const [isPending, startTransition] = useTransition();
  const { formRef, isComplete, recheck } = useRequiredFields();

  // --- ACTIVE MODAL OBSERVER VALUE STATES ---
  const [editType, setEditType] = useState(device.type || "PlayStation 5");
  const [editStation, setEditStation] = useState(device.station_number || "");
  const [editStatus, setEditStatus] = useState(device.status || "available");
  const [hourlyRate, setHourlyRate] = useState(device.device_type?.regular_hourly_rate || "");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Whether the admin asked for the saved picture to go.
   *
   * Kept apart from `localFile` because "no new file chosen" and "delete the one
   * on record" are different intentions that used to be indistinguishable - the
   * submit fell back to `device.image_url` either way, so a saved image could
   * never be taken off a station once it was on. Nothing is destroyed until the
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

  const filePreviewUrl = objectUrl ?? (imageRemoved ? null : device.image_url || null);

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

  const hasImage = Boolean(objectUrl) || (Boolean(device.image_url) && !imageRemoved);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetForm = e.currentTarget;

    startTransition(async () => {
      // Empty means "clear it" — the action stores that as NULL.
      let finalImageUrl = imageRemoved ? "" : device.image_url || "";

      // Check if a new file asset is uploaded to overwrite the historical one
      if (localFile) {
        const uploaded = await uploadImage('device-images', localFile);

        // A swallowed failure here reported "Configuration Updated" while
        // quietly keeping the old picture, so the admin had no way to tell their
        // upload had not happened.
        if ('error' in uploaded) {
          toast.error("Bucket upload error: " + uploaded.error);
          return;
        }

        finalImageUrl = uploaded.url;
      }

      const submissionFormData = new FormData(targetForm);
      submissionFormData.set('id', device.id);
      submissionFormData.set('image_url', finalImageUrl);
      submissionFormData.set('status', editStatus);

      const result = await updateDevice(submissionFormData);
      if (result.success) {
        toast.success("Configuration Updated", {
          description: `Station ${editStation} overrides applied successfully.`,
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
          <DialogTitle className="text-xl font-black tracking-tight text-white">Edit Device Configuration</DialogTitle>
          <p className="text-sm text-[#a1a1aa] mt-1">Modify real-time arena metrics and track design layout card alterations instantly</p>
        </div>

        <form ref={formRef} onChange={recheck} onSubmit={handleSubmit} className="flex-1 flex flex-col md:flex-row overflow-y-auto min-h-0">

          {/* Left Panel: Grid Input Layout Container */}
          <div className="flex-1 p-8 space-y-6 bg-[var(--background)] overflow-y-auto">

            {/* Form row block 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Platform Type <span className="text-red-500">*</span></label>
                <select
                  name="device_type_id"
                  defaultValue={device.device_type_id}
                  required
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 text-base focus:border-primary focus:ring-1 focus:ring-primary outline-none text-white cursor-pointer transition-colors"
                >
                  <option value={device.device_type_id}>{device.device_type?.display_name || "Current Type"}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Station ID <span className="text-red-500">*</span></label>
                <Input
                  name="station_number"
                  value={editStation}
                  onChange={(e) => setEditStation(e.target.value)}
                  className="h-10 bg-[var(--surface)] border-[#27272a] text-base text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                  required
                />
              </div>
            </div>

            {/* Form row block 2 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Hourly Rate <span className="text-red-500">*</span></label>
              <div className="relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="text-[#a1a1aa] text-base">₹</span>
                </div>
                <input
                  type="number"
                  name="hourly_rate"
                  placeholder="0"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] pl-7 pr-3 text-base focus:ring-1 focus:ring-primary focus:border-primary outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors"
                  required
                />
              </div>
            </div>

            {/*  Replaced simple input line with modern  field component */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Hardware Visual Image</label>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-[#27272a] border-dashed rounded-xl cursor-pointer bg-[var(--surface)] hover:bg-[#161616] hover:border-primary/40 transition-all group">
                <div className="flex items-center gap-3">
                  <UploadCloud className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                  <p className="text-sm text-[#a1a1aa] font-medium max-w-[280px] truncate">
                    {localFile ? localFile.name : "Choose a file to update existing image path"}
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

            {/* Upgraded layout status into a clean grid  */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Device Status <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MANUAL_DEVICE_STATUSES.map((status) => (
                  <label key={status} className={`flex items-center justify-center cursor-pointer rounded-lg border py-2.5 text-sm font-bold transition-all ${editStatus === status ? 'border-primary bg-primary/10 text-primary' : 'border-[#27272a] bg-[var(--surface)] text-[#a1a1aa] hover:border-zinc-700'}`}>
                    <input type="radio" name="status_radio" value={status} className="hidden" checked={editStatus === status} onChange={() => setEditStatus(status)} />
                    <span className="capitalize tracking-wide">{status}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Description</label>
              <textarea name="specs" defaultValue={device.specs} placeholder="GPU parameters, hardware configurations..." className="w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 py-2.5 text-base text-white focus:ring-1 focus:ring-primary focus:border-primary h-24 outline-none resize-none transition-colors" />
            </div>
          </div>

          <div className="w-full md:w-[350px] bg-[var(--surface)] border-l border-[#27272a]/70 p-8 flex flex-col justify-between items-center flex-shrink-0">
            <div className="w-full flex-1 flex flex-col justify-center">
              <p className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider mb-4 text-center">Adjusted Display Preview</p>

              <Card className="bg-[var(--background)] border-[#27272a] overflow-hidden w-full max-w-[250px] mx-auto shadow-2xl">
                <div className="h-32 w-full bg-[var(--background)] border-b border-[#27272a] flex items-center justify-center overflow-hidden relative">
                  {filePreviewUrl ? (
                    <img src={filePreviewUrl} alt="Real-time layout sync" className="w-full h-full object-cover animate-in fade-in duration-300" />
                  ) : (
                    <div className="flex flex-col items-center text-zinc-700 gap-1.5">
                      <ImageIcon className="h-5 w-5 text-muted-content" />
                      <span className="text-xs">No image mapped</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="p-1.5 bg-[var(--surface-hover)] rounded-md border border-zinc-800"><Gamepad2 className="h-4 w-4 text-primary" /></div>
                    <EditPreviewBadge previewStatus={editStatus} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white tracking-tight uppercase">{editStation || "STATION-ID"}</h3>
                    <p className="text-[#a1a1aa] text-xs flex items-center gap-1.5 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-primary"></span>{editType}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-900/60 pt-2 text-sm">
                    <span className="text-[#a1a1aa] font-medium">Rate / Hour</span>
                    <span className="font-bold text-primary text-base">₹{hourlyRate || "0"}</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Bottom Footer Control Row */}
            <div className="w-full flex justify-end gap-3 mt-6 pt-4 border-t border-[#27272a]/40 flex-shrink-0">
              <Button type="button" variant="ghost" className="text-[#a1a1aa] hover:bg-zinc-900 hover:text-white" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending || !isComplete} className="disabled:opacity-50 disabled:pointer-events-none bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-bold px-6 h-10 text-base rounded-md shadow-md transition-all">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Overrides"}
              </Button>
            </div>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPreviewBadge({ previewStatus }: { previewStatus: string }) {
  if (previewStatus === 'available') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-primary border border-primary/30 rounded uppercase bg-primary/5">Available</span>;
  if (previewStatus === 'maintenance') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#f43f5e] border border-[#f43f5e]/30 rounded uppercase bg-[#f43f5e]/5">Maintenance</span>;
  if (previewStatus === 'inactive') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#f43f5e] border border-[#f43f5e]/30 rounded uppercase bg-[#f43f5e]/5">Inactive</span>;
  return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#a1a1aa] border border-[#27272a] rounded uppercase bg-[var(--surface)]">Occupied</span>;
}