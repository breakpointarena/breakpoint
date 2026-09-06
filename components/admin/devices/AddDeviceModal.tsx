"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { PlusCircle, UploadCloud, Gamepad2, ImageIcon, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { createDevice, getDeviceTypes } from "@/app/(admin)/admin/devices/actions";
import { uploadImage } from "@/lib/storage/imageUpload";
import { toast } from "sonner";
import { useRequiredFields } from "@/lib/hooks/useRequiredFields";
import { MANUAL_DEVICE_STATUSES } from "@/lib/types/devices";

interface AddModalProps {
  onFormSuccess: () => Promise<void>;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function AddDeviceModal({ onFormSuccess, open, setOpen }: AddModalProps) {
  const [isPending, startTransition] = useTransition();
  const { formRef, isComplete, recheck } = useRequiredFields();

  const [deviceTypes, setDeviceTypes] = useState<any[]>([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState("");
  const [previewStation, setPreviewStation] = useState("");
  const [previewStatus, setPreviewStatus] = useState("available");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load device types on mount
  useEffect(() => {
    async function loadDeviceTypes() {
      const types = await getDeviceTypes();
      setDeviceTypes(types);
      if (types.length > 0) {
        setSelectedDeviceTypeId(types[0].id);
        // The device type select is `required` but is filled by this state
        // update, not by the user - which raises no change event, so the form's
        // onChange never fires and the submit button would stay disabled.
        setTimeout(recheck, 0);
      }
    }
    loadDeviceTypes();
  }, [recheck]);

  const selectedDeviceType = deviceTypes.find(dt => dt.id === selectedDeviceTypeId);

  const filePreviewUrl = useMemo(() => {
    if (!localFile) return null;
    return URL.createObjectURL(localFile);
  }, [localFile]);

  // An object URL is held by the browser until it is revoked. Swapping or
  // clearing the picture without this leaves the old blob alive for the life of
  // the page, and an admin trying a few photos leaks every one they discarded.
  useEffect(() => {
    if (!filePreviewUrl) return;
    return () => URL.revokeObjectURL(filePreviewUrl);
  }, [filePreviewUrl]);

  /**
   * Puts the picker back to empty.
   *
   * Clearing the state alone is not enough: the input keeps the old filename,
   * and picking the *same* file again would set an identical value and fire no
   * change event - so the image an admin just removed would refuse to come back.
   */
  const clearImage = () => {
    setLocalFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Writing to the input directly raises no change event, so the form's
    // onChange never fires and `isComplete` keeps whatever it last saw. Nudge it.
    recheck();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetForm = e.currentTarget;

    startTransition(async () => {
      let bucketUrl = "";

      if (localFile) {
        const uploaded = await uploadImage('device-images', localFile);

        if ('error' in uploaded) {
          toast.error("Bucket upload error: " + uploaded.error);
          return;
        }

        bucketUrl = uploaded.url;
      }

      const submissionFormData = new FormData(targetForm);
      if (bucketUrl) {
        submissionFormData.set('image_url', bucketUrl);
      }

      const result = await createDevice(submissionFormData);
      if (result.success) {
        setOpen(false);
        clearImage();
        setPreviewStation("");
        setSelectedDeviceTypeId(deviceTypes[0]?.id || "");

        toast.success("New Machine Registered", {
          description: `Station ${previewStation || "Asset"} added successfully.`,
          icon: <CheckCircle2 className="h-5 w-5 text-primary" />
        });

        await onFormSuccess();
      } else {
        toast.error("Registration Failed", {
          description: result.error,
          icon: <AlertCircle className="h-5 w-5 text-[#f43f5e]" />
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-semibold rounded-md px-6 transition-all duration-300 hover:scale-[1.02] glow-box">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Device
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-[var(--background)] border-[#27272a] text-white max-w-[900px] w-[95vw] p-0 overflow-hidden shadow-2xl h-auto max-h-[90vh] flex flex-col justify-between">

        {/* Header Panel */}
        <div className="p-6 pr-14 border-b border-[#27272a]/70 bg-[var(--surface)] flex-shrink-0">
          <DialogTitle className="text-xl font-black tracking-tight text-white">Add New Device</DialogTitle>
          <p className="text-sm text-[#a1a1aa] mt-1">Configure asset specifications and check real-time layout display metrics</p>
        </div>

        <form ref={formRef} onChange={recheck} onSubmit={handleSubmit} className="flex-1 flex flex-col md:flex-row overflow-y-auto min-h-0">

          {/* Left Form Panel */}
          <div className="flex-1 p-8 space-y-6 bg-[var(--background)] overflow-y-auto">

            {/* Input Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Device Type <span className="text-red-500">*</span></label>
                <select
                  name="device_type_id"
                  value={selectedDeviceTypeId}
                  onChange={(e) => setSelectedDeviceTypeId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 text-base focus:border-primary focus:ring-1 focus:ring-primary outline-none text-white cursor-pointer transition-colors"
                  required
                >
                  {deviceTypes.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.display_name}</option>
                  ))}
                </select>
                {selectedDeviceType && (
                  <p className="text-label">
                    ₹{selectedDeviceType.regular_hourly_rate}/hr • {selectedDeviceType.included_players} player{selectedDeviceType.included_players > 1 ? 's' : ''} included
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Station # <span className="text-red-500">*</span></label>
                <Input
                  name="station_number"
                  placeholder="e.g. SS-001"
                  className="h-10 bg-[var(--surface)] border-[#27272a] text-base text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                  value={previewStation}
                  onChange={(e) => setPreviewStation(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Visual File Upload Dropzone */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Hardware Visual Asset</label>
              <label className="flex flex-col items-center justify-center w-full h-24 border border-2 border-[#27272a] border-dashed rounded-xl cursor-pointer bg-[var(--surface)] hover:bg-[#161616] hover:border-primary/40 transition-all group">
                <div className="flex items-center gap-3">
                  <UploadCloud className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                  <p className="text-sm text-[#a1a1aa] font-medium max-w-[280px] truncate">
                    {localFile ? localFile.name : "Select or drag a hardware image cover"}
                  </p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => setLocalFile(e.target.files?.[0] || null)} />
              </label>

              {/* Outside the dropzone label on purpose — nested in it, a click
                  here would count as a click on the label and reopen the picker. */}
              {localFile && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#27272a] bg-[var(--surface)] px-3 py-2">
                  <span className="text-xs text-[#a1a1aa] truncate">{localFile.name}</span>
                  <button
                    type="button"
                    onClick={clearImage}
                    className="flex items-center gap-1 text-xs font-bold text-[#f43f5e] hover:text-[#fb7185] transition-colors flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              )}
            </div>

            {/* Device Status Selector Segment */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Device Status <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MANUAL_DEVICE_STATUSES.map((status) => (
                  <label key={status} className={`flex items-center justify-center cursor-pointer rounded-lg border py-2.5 text-sm font-bold transition-all ${previewStatus === status ? 'border-primary bg-primary/10 text-primary' : 'border-[#27272a] bg-[var(--surface)] text-[#a1a1aa] hover:border-zinc-700'}`}>
                    <input type="radio" name="status" value={status} className="hidden" checked={previewStatus === status} onChange={() => setPreviewStatus(status)} />
                    <span className="capitalize tracking-wide">{status}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Hardware Description Spec Box */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider">Description</label>
              <textarea name="specs" placeholder="GPU parameters, hardware models, preloaded setups..." className="w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 py-2.5 text-base text-white focus:ring-1 focus:ring-primary focus:border-primary h-24 outline-none resize-none transition-colors" />
            </div>
          </div>

          {/* Right Preview Side-Panel */}
          <div className="w-full md:w-[350px] bg-[var(--surface)] border-l border-[#27272a]/70 p-8 flex flex-col justify-between items-center flex-shrink-0">
            <div className="w-full flex-1 flex flex-col justify-center">
              <p className="text-xs font-bold text-[#a1a1aa] uppercase tracking-wider mb-4 text-center">Card Display Preview</p>

              <Card className="bg-[var(--background)] border-[#27272a] overflow-hidden w-full max-w-[250px] mx-auto shadow-2xl">
                <div className="h-32 w-full bg-[var(--background)] border-b border-[#27272a] flex items-center justify-center overflow-hidden relative">
                  {filePreviewUrl ? (
                    <img src={filePreviewUrl} alt="Preview display" className="w-full h-full object-cover animate-in fade-in duration-300" />
                  ) : (
                    <div className="flex flex-col items-center text-zinc-700 gap-1.5">
                      <ImageIcon className="h-5 w-5 text-muted-content" />
                      <span className="text-xs">No asset selected</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="p-1.5 bg-[var(--surface-hover)] rounded-md border border-zinc-800"><Gamepad2 className="h-4 w-4 text-primary" /></div>
                    <PreviewBadge previewStatus={previewStatus} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white tracking-tight uppercase">{previewStation || "STATION-ID"}</h3>
                    <p className="text-[#a1a1aa] text-xs flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      {selectedDeviceType?.display_name || "Device Type"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-900/60 pt-2 text-sm">
                    <span className="text-[#a1a1aa] font-medium">Rate / Hour</span>
                    <span className="font-bold text-primary text-base">
                      ₹{selectedDeviceType?.regular_hourly_rate || "0"}/hr
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Bottom Form Control Row */}
            <div className="w-full flex justify-end gap-3 mt-6 pt-4 border-t border-[#27272a]/40 flex-shrink-0">
              <Button type="button" variant="ghost" className="text-[#a1a1aa] hover:bg-zinc-900 hover:text-white" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending || !isComplete} className="disabled:opacity-50 disabled:pointer-events-none bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-bold px-6 h-10 text-base rounded-md shadow-md transition-all">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Device"}
              </Button>
            </div>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBadge({ previewStatus }: { previewStatus: string }) {
  if (previewStatus === 'available') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-primary border border-primary/30 rounded uppercase bg-primary/5">Available</span>;
  if (previewStatus === 'maintenance') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#f43f5e] border border-[#f43f5e]/30 rounded uppercase bg-[#f43f5e]/5">Maintenance</span>;
  if (previewStatus === 'inactive') return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#f43f5e] border border-[#f43f5e]/30 rounded uppercase bg-[#f43f5e]/5">Inactive</span>;
  return <span className="inline-flex px-2 py-0.5 text-xs font-bold text-[#a1a1aa] border border-[#27272a] rounded uppercase bg-[var(--surface)]">Occupied</span>;
}
