import { useEffect, useState } from "react";
import DesktopVirtualKeyboard from "@/components/DesktopVirtualKeyboard";
import { cn } from "@/lib/utils";

type EditableField = HTMLInputElement | HTMLTextAreaElement;

function isDemoInput(target: EventTarget | null): target is EditableField {
  return (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    target.dataset.mobileDemoInput !== undefined &&
    !target.disabled
  );
}

function formatStatusTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function AppShell({
  mainPane,
  className,
}: {
  mainPane: React.ReactNode;
  className?: string;
}) {
  const [isDesktopPointer, setIsDesktopPointer] = useState(false);
  const [activeDesktopField, setActiveDesktopField] = useState<EditableField | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updatePointerCapability = () => setIsDesktopPointer(mediaQuery.matches);

    updatePointerCapability();
    mediaQuery.addEventListener("change", updatePointerCapability);

    return () => mediaQuery.removeEventListener("change", updatePointerCapability);
  }, []);

  useEffect(() => {
    if (!isDesktopPointer) {
      setActiveDesktopField(null);
      return;
    }

    let blurFrameId: number | null = null;

    const handleFocusIn = (event: FocusEvent) => {
      if (isDemoInput(event.target)) {
        setActiveDesktopField(event.target);
      }
    };
    const handleFocusOut = () => {
      blurFrameId = window.requestAnimationFrame(() => {
        if (!isDemoInput(document.activeElement)) {
          setActiveDesktopField(null);
        }
      });
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      if (blurFrameId !== null) {
        window.cancelAnimationFrame(blurFrameId);
      }
    };
  }, [isDesktopPointer]);

  const isDesktopKeyboardVisible = isDesktopPointer && activeDesktopField !== null;

  return (
    <div className="device-stage">
      <div className="device-frame" aria-hidden="true">
        <div className="device-island" />
      </div>
      <div
        data-desktop-keyboard-visible={isDesktopKeyboardVisible || undefined}
        className={cn(
          "app-screen relative flex flex-col overflow-hidden bg-bg",
          className
        )}
      >
        {/* 噪点纹理层 - 增加纸张质感 */}
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.035]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        <PhoneStatusBar />
        <section className="relative z-20 flex min-h-0 flex-1 flex-col bg-bg">
          {mainPane}
        </section>
        {isDesktopKeyboardVisible && activeDesktopField && (
          <DesktopVirtualKeyboard
            activeField={activeDesktopField}
            onClose={() => {
              activeDesktopField.blur();
              setActiveDesktopField(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function PhoneStatusBar() {
  const [time, setTime] = useState(() => formatStatusTime(new Date()));

  useEffect(() => {
    const updateTime = () => setTime(formatStatusTime(new Date()));
    const intervalId = window.setInterval(updateTime, 1000 * 30);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="relative z-10 flex h-9 shrink-0 items-center justify-between bg-bg px-[26px] pt-1 text-text">
      <span className="min-w-[54px] text-[15px] font-semibold leading-5 tracking-normal">
        {time}
      </span>
      <div className="flex items-center gap-1.5 text-text" aria-hidden="true">
        <SignalIcon />
        <span className="text-[11px] font-semibold leading-4">5G</span>
        <BatteryIcon />
      </div>
    </div>
  );
}

function SignalIcon() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
      <rect x="1" y="7" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect x="5" y="5" width="2.5" height="6" rx="1" fill="currentColor" />
      <rect x="9" y="3" width="2.5" height="8" rx="1" fill="currentColor" />
      <rect x="13" y="1" width="2.5" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
      <rect
        x="1"
        y="2"
        width="22"
        height="9"
        rx="2.8"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.72"
      />
      <path
        d="M24 5.2C24.9 5.55 25.5 6.02 25.5 6.5C25.5 6.98 24.9 7.45 24 7.8V5.2Z"
        fill="currentColor"
        opacity="0.72"
      />
      <rect x="3" y="4" width="18" height="5" rx="1.6" fill="currentColor" />
    </svg>
  );
}
