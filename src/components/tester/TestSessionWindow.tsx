import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type EventPayload,
  EventType,
  type MinecraftProcessExitedPayload,
} from "../../types/events";

type Phase = "preparing" | "running" | "finished";

const PHASE_LABELS: Partial<Record<EventType, string>> = {
  [EventType.InstallingJava]: "Installing Java",
  [EventType.DownloadingLibraries]: "Downloading libraries",
  [EventType.ExtractingNatives]: "Extracting natives",
  [EventType.DownloadingAssets]: "Downloading assets",
  [EventType.ReusingMinecraftAssets]: "Reusing Minecraft assets",
  [EventType.CopyingInitialData]: "Copying initial data",
  [EventType.CopyingNoRiskClientAssets]: "Copying NoRisk assets",
  [EventType.DownloadingNoRiskClientAssets]: "Downloading NoRisk assets",
  [EventType.DownloadingClient]: "Downloading client",
  [EventType.InstallingFabric]: "Installing Fabric",
  [EventType.InstallingQuilt]: "Installing Quilt",
  [EventType.InstallingForge]: "Installing Forge",
  [EventType.InstallingNeoForge]: "Installing NeoForge",
  [EventType.PatchingForge]: "Patching Forge",
  [EventType.DownloadingMods]: "Downloading pack mods",
  [EventType.SyncingMods]: "Syncing mods",
  [EventType.LaunchingMinecraft]: "Launching Minecraft",
};

function params() {
  const search = new URLSearchParams(window.location.search);
  return {
    title: search.get("title") ?? "NoRisk test",
    pack: search.get("pack") ?? "",
    version: search.get("version") ?? "",
  };
}

export function TestSessionWindow() {
  const { title, pack, version } = useMemo(params, []);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [step, setStep] = useState("Preparing your test instance");
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<EventPayload>("state_event", (event) => {
      const { event_type, progress: value, error } = event.payload;

      if (error) setFailed(error);

      if (event_type === EventType.MinecraftProcessExited) {
        let success = true;
        try {
          const exited = JSON.parse(
            event.payload.message,
          ) as MinecraftProcessExitedPayload;
          success = exited.success;
        } catch {
          // message is not the structured payload — treat as a clean exit
        }
        setPhase("finished");
        setProgress(null);
        setStep(
          success
            ? "Minecraft closed — opening the feedback form"
            : "Minecraft closed unexpectedly",
        );
        return;
      }

      const label = PHASE_LABELS[event_type];
      if (!label) return;

      setStep(label);
      setProgress(typeof value === "number" ? value : null);
      setPhase(
        event_type === EventType.LaunchingMinecraft ? "running" : "preparing",
      );
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    setStep("Minecraft is running — close it when you are done testing");
  }, [phase]);

  const percent =
    progress != null ? Math.max(0, Math.min(100, Math.round(progress * 100))) : null;

  return (
    <div
      data-tauri-drag-region
      className="flex h-screen w-screen flex-col justify-between bg-black p-5 font-minecraft text-white/80 select-none"
    >
      <div data-tauri-drag-region className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{title}</p>
          <p className="truncate text-xs text-white/40">
            {[version, pack].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-white/10 px-2 py-1 text-xs text-white/50 hover:text-white"
          onClick={() => void getCurrentWindow().hide()}
        >
          Hide
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-white/70">{failed ?? step}</p>

        <div className="h-1.5 w-full overflow-hidden rounded bg-white/10">
          <div
            className={
              percent == null
                ? "h-full w-1/3 animate-pulse rounded bg-purple-400"
                : "h-full rounded bg-purple-400 transition-all"
            }
            style={percent == null ? undefined : { width: `${percent}%` }}
          />
        </div>

        <p className="text-xs text-white/35">
          {phase === "finished"
            ? "You can close this window."
            : "The launcher stays in the background while you test."}
        </p>
      </div>
    </div>
  );
}
