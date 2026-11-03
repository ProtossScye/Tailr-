"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { fetchAllBets, messageFor } from "@/lib/client/api";
import { betsToCsv } from "@/lib/client/export";
import { useAllBets } from "@/lib/client/hooks";
import { UNSPECIFIED, bookmakerOf, groupBets } from "@/lib/client/stats";
import { DownloadIcon, LogoutIcon } from "@/components/icons";
import { PageHeader, Segmented, initialsOf } from "@/components/ui";
import { useCurrentUser } from "@/components/user-context";
import { saveDisplayName } from "./actions";

type Theme = "system" | "dark" | "light";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("tailr.theme");
    return t === "dark" || t === "light" ? t : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") {
      localStorage.removeItem("tailr.theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("tailr.theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ProfileView() {
  const user = useCurrentUser();
  const [theme, setTheme] = useState<Theme>("system");
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(saveDisplayName, undefined);
  const [bets] = useAllBets();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (state?.message) setEditing(false);
  }, [state]);

  const bookmakers = useMemo(() => {
    if (bets.state !== "ready") return null;
    return groupBets(bets.data, bookmakerOf)
      .filter((r) => r.key !== UNSPECIFIED)
      .map((r) => ({ name: r.key, total: r.stats.settled + r.stats.voids + r.stats.pending }));
  }, [bets]);

  const exportData = async (format: "csv" | "json") => {
    setExporting(true);
    setExportError(null);
    try {
      const all = await fetchAllBets();
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") download(`tailr-bets-${stamp}.csv`, betsToCsv(all), "text/csv;charset=utf-8");
      else download(`tailr-bets-${stamp}.json`, JSON.stringify(all, null, 2), "application/json");
    } catch (error) {
      setExportError(messageFor(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Profile" />

      <section className="card card-pad stack" aria-labelledby="identity-title">
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span className="avatar avatar-lg" aria-hidden="true">
            {initialsOf(user.name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 id="identity-title" className="section-title" style={{ overflowWrap: "anywhere" }}>
              {user.name}
            </h2>
            <p className="muted" style={{ overflowWrap: "anywhere" }}>
              {user.email}
            </p>
          </div>
        </div>
        {editing ? (
          <form action={action} className="form">
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                name="displayName"
                className="input"
                defaultValue={user.hasDisplayName ? user.name : ""}
                maxLength={80}
                autoComplete="nickname"
                required
                aria-invalid={state?.error ? true : undefined}
                aria-describedby={state?.error ? "name-error" : undefined}
                autoFocus
              />
              {state?.error ? (
                <span className="field-error" id="name-error" role="alert">
                  {state.error}
                </span>
              ) : null}
            </div>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Saving" : "Save name"}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            {state?.message ? (
              <p className="banner banner-note" role="status">
                {state.message}
              </p>
            ) : null}
            <span>
              <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
                Edit profile
              </button>
            </span>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          Username, bio and profile photo are not available yet.
        </p>
      </section>

      <section className="section" aria-labelledby="books-title">
        <h2 className="section-title" id="books-title">
          Bookmakers
        </h2>
        {bets.state === "loading" ? (
          <div className="card card-pad">
            <p className="muted" role="status">
              Loading
            </p>
          </div>
        ) : bets.state === "error" ? (
          <p className="banner banner-error" role="alert">
            {bets.message}
          </p>
        ) : bookmakers && bookmakers.length > 0 ? (
          <ul className="card list">
            {bookmakers.map((b) => (
              <li key={b.name} className="settings-row" style={{ cursor: "default" }}>
                <span>
                  {b.name}
                  <small>Tracked manually</small>
                </span>
                <span className="num muted">
                  {b.total} {b.total === 1 ? "bet" : "bets"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card card-pad">
            <p className="muted">No bookmakers yet. Name one when you add a bet and it is tracked here.</p>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          Managed by the name on each bet. Connecting or importing from a bookmaker account is not available.
        </p>
      </section>

      <section className="section" aria-labelledby="prefs-title">
        <h2 className="section-title" id="prefs-title">
          Betting preferences
        </h2>
        <div className="card card-pad">
          <p className="muted">
            Favourite sports and leagues, preferred and avoided markets, odds range and typical stake are not saved to your account yet. In Create you can
            pick preferred markets and a target odds range for the slip you are working on.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="app-title">
        <h2 className="section-title" id="app-title">
          Appearance
        </h2>
        <Segmented<Theme>
          label="Theme"
          full
          value={theme}
          onChange={(next) => {
            setTheme(next);
            applyTheme(next);
          }}
          options={[
            { value: "system", label: "Match device" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </section>

      <section className="section" aria-labelledby="data-title">
        <h2 className="section-title" id="data-title">
          Your data
        </h2>
        <div className="card card-pad stack">
          <p>Download every bet you recorded, with its selections.</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => exportData("csv")} disabled={exporting}>
              <DownloadIcon /> {exporting ? "Preparing" : "Export CSV"}
            </button>
            <button type="button" className="btn" onClick={() => exportData("json")} disabled={exporting}>
              <DownloadIcon /> Export JSON
            </button>
          </div>
          {exportError ? (
            <p className="banner banner-error" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>
        <div className="card card-pad stack">
          <h3 style={{ fontSize: 16 }}>Account</h3>
          <p className="muted">
            Account deletion, password changes, notification preferences and profile visibility are not available in the app yet. Profile visibility does
            not apply because profiles are private: only you can see your bets.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="support-title">
        <h2 className="section-title" id="support-title">
          About Tailr
        </h2>
        <div className="card card-pad stack">
          <p>Tailr tracks the bets you tell it about. Results are reported by you and are not verified with any bookmaker.</p>
          <p className="muted">Help centre, feedback and issue reporting are not available in the app yet.</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="btn btn-block btn-danger">
            <LogoutIcon /> Log out
          </button>
        </form>
      </section>
    </div>
  );
}
