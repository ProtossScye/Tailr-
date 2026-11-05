"use client";

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "installed" | "ios" | "prompt" | "other";

/**
 * Helps put Tailr on the home screen. Android and desktop Chrome can install with one tap; iPhones
 * have no install button, so they get the two steps instead. Hidden once the app is already open
 * from the home screen. This is the website installed as an app: it still needs an internet connection.
 */
export function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const [platform, setPlatform] = useState<Platform>("other");
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setPlatform("installed");
      return;
    }
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    if (iOS) setPlatform("ios");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setPlatform("prompt");
    };
    const onInstalled = () => setPlatform("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (platform === "installed") return null;

  return (
    <div className={compact ? "stack" : "card card-pad stack"}>
      <h3 style={{ fontSize: 16 }}>Add Tailr to your home screen</h3>
      {platform === "prompt" && event ? (
        <>
          <p className="muted" style={{ fontSize: 14 }}>
            Opens full screen like an app, with its own icon.
          </p>
          <span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await event.prompt();
                await event.userChoice.catch(() => undefined);
                setEvent(null);
                setPlatform("other");
              }}
            >
              Install Tailr
            </button>
          </span>
        </>
      ) : platform === "ios" ? (
        <ol className="muted" style={{ fontSize: 14, margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
          <li>Open Tailr in Safari (not inside another app).</li>
          <li>Tap the Share button at the bottom of the screen.</li>
          <li>Choose Add to Home Screen, then Add.</li>
        </ol>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          On Android, open the browser menu (three dots) and choose Install app or Add to Home screen. On iPhone, use Safari: Share, then Add to Home Screen.
        </p>
      )}
      <p className="muted" style={{ fontSize: 13 }}>
        It is the same Tailr website, so it needs an internet connection.
      </p>
    </div>
  );
}
