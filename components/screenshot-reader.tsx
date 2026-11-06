"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageReadJson } from "@/lib/api/types";
import { ApiError, messageFor } from "@/lib/client/api";
import { ImageError, prepareImage } from "@/lib/client/image";
import { readScreenshot } from "@/lib/client/parse";

/**
 * Pick or take a screenshot of a slip, see it, and have Tailr read it. The picture is shrunk and
 * re-saved in the browser first. It is sent only when the person presses Read, is not kept by Tailr,
 * and the result is shown next to the picture so each line can be checked against it.
 */
export function ScreenshotReader({
  available,
  busy,
  onStart,
  onResult,
  onError,
  onClear,
}: {
  available: boolean;
  /** Another read is running. */
  busy: boolean;
  onStart: () => void;
  onResult: (result: ImageReadJson, previewUrl: string) => void;
  onError: (message: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [reading, setReading] = useState(false);

  // Free the preview when it is replaced or the page closes.
  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      const blob = await prepareImage(file);
      setPreview({ blob, url: URL.createObjectURL(blob) });
      onClear();
    } catch (error) {
      onError(error instanceof ImageError ? error.message : "This picture could not be prepared. Try another one.");
    } finally {
      setPreparing(false);
    }
  };

  const read = async () => {
    if (!preview || reading || busy) return;
    setReading(true);
    onStart();
    try {
      const result = await readScreenshot(preview.blob);
      onResult(result, preview.url);
    } catch (error) {
      // An image the server rejected has a clearer message on the field than the general one.
      onError(error instanceof ApiError && error.issues[0] ? error.issues[0].message : messageFor(error));
    } finally {
      setReading(false);
    }
  };

  const remove = () => {
    setPreview(null);
    onClear();
  };

  return (
    <div className="field">
      <span className="label">Add a screenshot of the slip</span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="screenshot-input"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {preview ? (
        <div className="stack" style={{ gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="Your screenshot of the slip" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)" }} />
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={read} disabled={!available || reading || busy}>
              {reading ? "Reading the screenshot" : "Read screenshot"}
            </button>
            <button type="button" className="btn" onClick={() => input.current?.click()} disabled={reading || preparing}>
              Choose another
            </button>
            <button type="button" className="text-btn danger" onClick={remove} disabled={reading}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <span>
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={preparing || !available}>
            {preparing ? "Preparing" : "Choose a screenshot"}
          </button>
        </span>
      )}
      <span className="hint">
        {available
          ? "The screenshot is sent to an AI service, which only copies out the text it can see. Tailr's own reader then reads that text, nothing is added or guessed, and the picture is not kept. It can still misread small or blurry text, so check the result against your screenshot."
          : "Screenshot reading is not switched on yet. Paste the slip text below."}
      </span>
    </div>
  );
}
