import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useThemeStore } from "../../store/useThemeStore";
import { useFontStore } from "../../store/font-store";
import {
  type EventPayload,
  EventType,
  type MinecraftProcessExitedPayload,
} from "../../types/events";

const appWindow = getCurrentWindow();

type Stage = "preparing" | "running" | "finished" | "failed";

type StepId = "install" | "pack" | "launch" | "play";

const STEPS: { id: StepId; label: string; icon: string }[] = [
  { id: "install", label: "Preparing game files", icon: "solar:download-square-bold" },
  { id: "pack", label: "Installing the pack", icon: "solar:box-bold" },
  { id: "launch", label: "Launching Minecraft", icon: "solar:rocket-bold" },
  { id: "play", label: "Testing", icon: "solar:gamepad-bold" },
];

const EVENT_STEPS: Partial<Record<EventType, { step: StepId; label: string }>> = {
  [EventType.InstallingJava]: { step: "install", label: "Installing Java" },
  [EventType.DownloadingLibraries]: { step: "install", label: "Downloading libraries" },
  [EventType.ExtractingNatives]: { step: "install", label: "Extracting natives" },
  [EventType.DownloadingAssets]: { step: "install", label: "Downloading assets" },
  [EventType.ReusingMinecraftAssets]: { step: "install", label: "Reusing assets" },
  [EventType.DownloadingClient]: { step: "install", label: "Downloading client" },
  [EventType.CopyingInitialData]: { step: "install", label: "Copying initial data" },
  [EventType.InstallingFabric]: { step: "install", label: "Installing Fabric" },
  [EventType.InstallingQuilt]: { step: "install", label: "Installing Quilt" },
  [EventType.InstallingForge]: { step: "install", label: "Installing Forge" },
  [EventType.InstallingNeoForge]: { step: "install", label: "Installing NeoForge" },
  [EventType.PatchingForge]: { step: "install", label: "Patching Forge" },
  [EventType.CopyingNoRiskClientAssets]: { step: "pack", label: "Copying NoRisk assets" },
  [EventType.DownloadingNoRiskClientAssets]: { step: "pack", label: "Downloading NoRisk assets" },
  [EventType.DownloadingMods]: { step: "pack", label: "Downloading pack mods" },
  [EventType.SyncingMods]: { step: "pack", label: "Syncing mods" },
  [EventType.LaunchingMinecraft]: { step: "launch", label: "Launching Minecraft" },
};

function complementaryBackground(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = m
    ? {
        r: Number.parseInt(m[1], 16),
        g: Number.parseInt(m[2], 16),
        b: Number.parseInt(m[3], 16),
      }
    : { r: 34, g: 34, b: 34 };
  const r = Math.min(Math.floor(rgb.r * 0.1), 30);
  const g = Math.min(Math.floor(rgb.g * 0.1), 30);
  const b = Math.min(Math.floor(rgb.b * 0.1), 30);
  return `rgb(${r}, ${g}, ${b})`;
}

function BorderGlow({ color }: { color: string }) {
  const horizontal = `linear-gradient(to right, transparent, ${color}70, transparent)`;
  const vertical = `linear-gradient(to bottom, transparent, ${color}70, transparent)`;
  return (
    <>
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-20" style={{ background: horizontal }} />
      <div className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none z-20" style={{ background: horizontal }} />
      <div className="absolute top-0 bottom-0 left-0 w-[2px] pointer-events-none z-20" style={{ background: vertical }} />
      <div className="absolute top-0 bottom-0 right-0 w-[2px] pointer-events-none z-20" style={{ background: vertical }} />
    </>
  );
}

function readParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    title: search.get("title") ?? "NoRisk test",
    pack: search.get("pack") ?? "",
    version: search.get("version") ?? "",
  };
}

export function TestSessionWindow() {
  const accentColor = useThemeStore((state) => state.accentColor);
  const accent = accentColor.value;
  const background = complementaryBackground(accent);

  const { title, pack, version } = useMemo(readParams, []);
  const [stage, setStage] = useState<Stage>("preparing");
  const [activeStep, setActiveStep] = useState<StepId>("install");
  const [detail, setDetail] = useState("Getting the test instance ready");
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const themeStore = useThemeStore.getState();
    themeStore.applyAccentColorToDOM();
    themeStore.applyBorderRadiusToDOM();
    useFontStore.getState().applyFontToDOM();
  }, []);

  useEffect(() => {
    const unlisten = listen<EventPayload>("state_event", (event) => {
      const { event_type, progress: value, error } = event.payload;

      if (event_type === EventType.MinecraftProcessExited) {
        let success = true;
        try {
          const exited = JSON.parse(event.payload.message) as MinecraftProcessExitedPayload;
          success = exited.success;
        } catch {
          success = true;
        }
        setStage(success ? "finished" : "failed");
        setActiveStep("play");
        setProgress(null);
        setDetail(
          success
            ? "Opening the feedback form in your browser"
            : "Minecraft closed unexpectedly",
        );
        return;
      }

      if (error) {
        setStage("failed");
        setDetail(error);
        setProgress(null);
        return;
      }

      const mapped = EVENT_STEPS[event_type];
      if (!mapped) return;

      setActiveStep(mapped.step);
      setDetail(mapped.label);
      setProgress(typeof value === "number" ? value : null);
      setStage(mapped.step === "launch" ? "running" : "preparing");
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (stage !== "running") return;
    const timer = setTimeout(() => {
      setActiveStep("play");
      setDetail("Close Minecraft when you are done testing");
      setProgress(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [stage]);

  const activeIndex = STEPS.findIndex((step) => step.id === activeStep);
  const percent =
    progress != null ? Math.max(0, Math.min(100, Math.round(progress * 100))) : null;

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden border-2 text-white backdrop-blur-lg"
      style={{
        backgroundColor: background,
        backgroundImage: `linear-gradient(to bottom right, ${background}, rgba(0,0,0,0.9))`,
        borderColor: `${accent}30`,
        boxShadow: `0 0 15px ${accent}30, inset 0 0 10px ${accent}20`,
      }}
    >
      <BorderGlow color={accent} />

      <div
        className="relative flex h-11 shrink-0 select-none items-center justify-between border-b border-white/5 bg-black/40 px-4"
        data-tauri-drag-region
      >
        <div className="pointer-events-none flex h-full flex-1 items-center gap-3" data-tauri-drag-region>
          <Icon icon="solar:test-tube-bold" className="h-4 w-4" style={{ color: accent }} />
          <span className="font-minecraft text-xs tracking-wider" style={{ color: accent }}>
            Test Session
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => appWindow.hide()}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-white/10"
            title="Hide"
          >
            <Icon icon="mdi:minus" className="h-4 w-4 text-white/70" />
          </button>
          <button
            onClick={() => appWindow.close()}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-red-500/80"
            title="Close"
          >
            <Icon icon="mdi:close" className="h-4 w-4 text-white/70" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <p className="truncate font-minecraft text-sm tracking-wide text-white">{title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {[version, pack].filter(Boolean).map((chip) => (
              <span
                key={chip}
                className="rounded px-2 py-0.5 font-minecraft text-[10px] tracking-wider"
                style={{
                  background: `${accent}25`,
                  color: accent,
                  border: `1px solid ${accent}40`,
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1">
          {STEPS.map((step, index) => {
            const done = index < activeIndex || stage === "finished";
            const active = index === activeIndex && stage !== "finished";
            return (
              <div key={step.id} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full items-center gap-1">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors"
                    style={{
                      borderColor: done || active ? `${accent}80` : "rgba(255,255,255,0.12)",
                      background: active ? `${accent}25` : done ? `${accent}15` : "transparent",
                      color: done || active ? accent : "rgba(255,255,255,0.35)",
                    }}
                  >
                    <Icon
                      icon={done ? "solar:check-circle-bold" : step.icon}
                      className={`h-4 w-4 ${active ? "animate-pulse" : ""}`}
                    />
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className="h-[2px] flex-1 rounded"
                      style={{
                        background: done ? `${accent}70` : "rgba(255,255,255,0.08)",
                      }}
                    />
                  )}
                </div>
                <span
                  className="w-full text-center text-[9px] leading-tight tracking-wide"
                  style={{ color: done || active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)" }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-white/70">{detail}</p>
            {percent != null && (
              <span className="font-minecraft text-[10px] tracking-wider" style={{ color: accent }}>
                {percent}%
              </span>
            )}
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded bg-white/10">
            <div
              className={percent == null ? "h-full w-1/3 animate-pulse rounded" : "h-full rounded transition-all"}
              style={{
                background: stage === "failed" ? "#ef4444" : accent,
                boxShadow: `0 0 10px ${accent}70`,
                ...(percent == null ? {} : { width: `${percent}%` }),
              }}
            />
          </div>

          <p className="text-[10px] text-white/35">
            {stage === "finished" || stage === "failed"
              ? "You can close this window."
              : "The launcher stays in the background while you test."}
          </p>
        </div>
      </div>
    </div>
  );
}
