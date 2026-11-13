"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/client/api";
import { connectedOn, disconnectTelegram, fetchTelegramStatus, makeTelegramCode } from "@/lib/client/telegram";
import type { TelegramLinkCodeJson, TelegramStatusJson } from "@/lib/api/types";

const POLL_MS = 4000;

/**
 * Connect, check and disconnect Telegram. The one-time code is shown here and nowhere else; while it
 * is on screen the page checks every few seconds so it flips to "Connected" as soon as the bot has it.
 */
export function TelegramConnect() {
  const [status, setStatus] = useState<TelegramStatusJson | null>(null);
  const [code, setCode] = useState<TelegramLinkCodeJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    fetchTelegramStatus()
      .then((s) => alive.current && setStatus(s))
      .catch((e) => alive.current && setError(messageFor(e)));
    return () => {
      alive.current = false;
    };
  }, []);

  // While a code is showing, watch for the connection, and drop the code once it has expired.
  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(async () => {
      if (new Date(code.expiresAt).getTime() <= Date.now()) {
        setCode(null);
        return;
      }
      try {
        const s = await fetchTelegramStatus();
        if (alive.current && s.linked) {
          setStatus(s);
          setCode(null);
        }
      } catch {
        // Try again at the next tick.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [code]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setCode(await makeTelegramCode());
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectTelegram();
      setStatus((s) => (s ? { ...s, linked: false, linkedAt: null } : s));
      setConfirming(false);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === null) return <div className="card card-pad">{error ? <p className="banner banner-error" role="alert">{error}</p> : <p className="muted">Loading</p>}</div>;

  return (
    <div className="card card-pad stack">
      {error ? (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      ) : null}

      {!status.available ? (
        <p className="muted">Telegram is not switched on yet.</p>
      ) : status.linked ? (
        <>
          <p>
            <strong>Connected</strong>
            {status.linkedAt && connectedOn(status.linkedAt) ? ` on ${connectedOn(status.linkedAt)}` : ""}. Send the bot a slip as text and it appears in Create as a draft.
          </p>
          {confirming ? (
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={disconnect} disabled={busy}>
                {busy ? "Disconnecting" : "Yes, disconnect"}
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
                Stay connected
              </button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              Disconnect Telegram
            </button>
          )}
        </>
      ) : code ? (
        <>
          <p>Tap the button to open Telegram and press Start. This code works once and expires in 10 minutes.</p>
          <a className="btn btn-primary" href={code.deepLink} target="_blank" rel="noreferrer">
            Open Telegram
          </a>
          <p className="muted">
            Or send this to @{code.botUsername}: <code data-testid="telegram-code">/link {code.code}</code>
          </p>
          <button type="button" className="btn" onClick={connect} disabled={busy}>
            Make a new code
          </button>
        </>
      ) : (
        <>
          <p>Send slips to Tailr from Telegram. They are saved as drafts for you to check, never as placed bets.</p>
          <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
            {busy ? "Making a code" : "Connect Telegram"}
          </button>
        </>
      )}

      {status.available ? <p className="muted" style={{ fontSize: 13 }}>The bot only saves slips you send it. It never shows your bets, and it ignores group chats.</p> : null}
    </div>
  );
}
