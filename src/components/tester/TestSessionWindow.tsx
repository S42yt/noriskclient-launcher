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

const STEPS: { id: StepId; label: string; hint: string; icon: string }[] = [
  {
    id: "install",
    label: "Preparing game files",
    hint: "Java, libraries and assets",
    icon: "solar:download-square-bold",
  },
  {
    id: "pack",
    label: "Installing the pack",
    hint: "Mods and NoRisk assets",
    icon: "solar:box-bold",
  },
  {
    id: "launch",
    label: "Launching Minecraft",
    hint: "Starting the test instance",
    icon: "solar:rocket-bold",
  },
  {
    id: "play",
    label: "Testing",
    hint: "Close the game when you are done",
    icon: "solar:gamepad-bold",
  },
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
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-[2px]" style={{ background: horizontal }} />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-[2px]" style={{ background: horizontal }} />
      <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-20 w-[2px]" style={{ background: vertical }} />
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-20 w-[2px]" style={{ background: vertical }} />
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
  const failed = stage === "failed";
  const barColor = failed ? "#ef4444" : accent;

  return (
    <div
      className="relative box-border flex h-screen w-screen flex-col overflow-hidden border-2 text-white"
      style={{
        backgroundColor: background,
        backgroundImage: `linear-gradient(to bottom right, ${background}, rgba(0,0,0,0.92))`,
        borderColor: `${accent}30`,
        boxShadow: `0 0 15px ${accent}30, inset 0 0 10px ${accent}20`,
      }}
    >
      <BorderGlow color={accent} />

      <div
        className="relative flex h-12 shrink-0 select-none items-center justify-between border-b border-white/5 bg-black/40 px-4"
        data-tauri-drag-region
      >
        <div className="pointer-events-none flex h-full flex-1 items-center gap-3" data-tauri-drag-region>
          <Icon icon="solar:test-tube-bold" className="h-5 w-5" style={{ color: accent }} />
          <span className="font-minecraft text-sm tracking-wider" style={{ color: accent }}>
            Test Session
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => appWindow.hide()}
            className="flex h-9 w-9 items-center justify-center rounded transition-colors hover:bg-white/10"
            title="Hide"
          >
            <Icon icon="mdi:minus" className="h-5 w-5 text-white/70" />
          </button>
          <button
            onClick={() => appWindow.close()}
            className="flex h-9 w-9 items-center justify-center rounded transition-colors hover:bg-red-500/80"
            title="Close"
          >
            <Icon icon="mdi:close" className="h-5 w-5 text-white/70" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-6">
        <div className="min-w-0 shrink-0">
          <p className="truncate font-minecraft text-lg tracking-wide text-white">{title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[version, pack].filter(Boolean).map((chip) => (
              <span
                key={chip}
                className="rounded px-2.5 py-1 font-minecraft text-xs tracking-wider"
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

        <div className="custom-scrollbar -mr-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {STEPS.map((step, index) => {
            const done = index < activeIndex || (stage === "finished" && index <= activeIndex);
            const active = index === activeIndex && stage !== "finished";
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                style={{
                  background: active ? `${accent}12` : "transparent",
                  border: `1px solid ${active ? `${accent}35` : "transparent"}`,
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors"
                  style={{
                    borderColor: done || active ? `${accent}80` : "rgba(255,255,255,0.12)",
                    background: active ? `${accent}25` : done ? `${accent}15` : "transparent",
                    color: done || active ? accent : "rgba(255,255,255,0.3)",
                  }}
                >
                  <Icon
                    icon={done ? "solar:check-circle-bold" : step.icon}
                    className={`h-5 w-5 ${active && !failed ? "animate-pulse" : ""}`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{
                      color: done || active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {step.label}
                  </p>
                  <p className="truncate text-xs text-white/35">
                    {active ? detail : step.hint}
                  </p>
                </div>

                {active && percent != null && (
                  <span
                    className="shrink-0 font-minecraft text-sm tracking-wider"
                    style={{ color: accent }}
                  >
                    {percent}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={
                percent == null && !failed && stage !== "finished"
                  ? "h-full w-1/3 animate-pulse rounded-full"
                  : "h-full rounded-full transition-all duration-300"
              }
              style={{
                background: barColor,
                boxShadow: `0 0 12px ${barColor}70`,
                ...(percent == null
                  ? stage === "finished"
                    ? { width: "100%" }
                    : {}
                  : { width: `${percent}%` }),
              }}
            />
          </div>

          <p className="text-xs text-white/40">
            {stage === "finished" || failed
              ? "You can close this window."
              : "The launcher stays in the background while you test."}
          </p>
        </div>
      </div>
    </div>
  );
}
