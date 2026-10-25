"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const userAgent = window.navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    setIsStandalone(standalone);
    setIsIOS(ios);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") setIsStandalone(true);
    } catch (error) {
      console.error("Could not open the browser install prompt:", error);
      setInstallPrompt(null);
      setShowInstructions(true);
    }
  };

  if (isStandalone) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/10 py-3 text-sm font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
      >
        <Download className="h-4 w-4" />
        Install App
      </button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="z-[200] border-zinc-800 bg-[#111] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Add Break Point Arena to your phone</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-zinc-400">
              {isIOS
                ? "In Safari, tap the Share button, choose Add to Home Screen, then tap Add."
                : "Open your browser menu and choose Install app or Add to Home screen."}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
