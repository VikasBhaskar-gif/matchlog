import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "../api/client";
import type { Match, WatchRecord } from "../api/types";
import { canRecordWatch } from "../lib/format";

type Props = {
  match: Match;
  existingWatch?: WatchRecord | null;
  onClose: () => void;
  onSaved: () => void;
};

type Preset = "FULL" | "FIRST_HALF" | "SECOND_HALF" | "CUSTOM";

export function WatchModal({ match, existingWatch, onClose, onSaved }: Props) {
  const canRecord = canRecordWatch(match);
  const max = match.maxWatchMinutes ?? 90;
  const [start, setStart] = useState(existingWatch?.startMinute ?? 0);
  const [end, setEnd] = useState(existingWatch?.endMinute ?? 90);
  const [preset, setPreset] = useState<Preset>(() => {
    if (!existingWatch) return "FULL";
    if (existingWatch.watchType === "FULL_MATCH") return "FULL";
    if (existingWatch.watchType === "FIRST_HALF") return "FIRST_HALF";
    if (existingWatch.watchType === "SECOND_HALF") return "SECOND_HALF";
    return "CUSTOM";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "FULL") { setStart(0); setEnd(90); }
    if (p === "FIRST_HALF") { setStart(0); setEnd(45); }
    if (p === "SECOND_HALF") { setStart(45); setEnd(90); }
  }

  const duration = end - start;

  async function handleSave() {
    if (!existingWatch && !canRecord) {
      setError("Watching can only be recorded after the match has started.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existingWatch) {
        await api.patch(`/watches/${existingWatch.id}`, { startMinute: start, endMinute: end });
      } else {
        await api.post(`/matches/${match.id}/watch`, { startMinute: start, endMinute: end });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingWatch) return;
    setSaving(true);
    try {
      await api.delete(`/watches/${existingWatch.id}`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove this record.");
      setSaving(false);
    }
  }

  const homeName = match.homeTeam?.name ?? match.homeTeamId ?? "Home";
  const awayName = match.awayTeam?.name ?? match.awayTeamId ?? "Away";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0f1520]/95 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-2xl animate-scale-in relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏱️</span>
            <h2 className="text-lg font-black text-white tracking-tight">
              {existingWatch ? "Edit Watch Record" : "Record Match Watch"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-5 flex items-center gap-1.5">
          <span className="font-semibold text-slate-200">{homeName}</span>
          <span>vs</span>
          <span className="font-semibold text-slate-200">{awayName}</span>
        </p>

        {!existingWatch && !canRecord && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300 flex items-start gap-2.5">
            <span className="text-base select-none">ℹ️</span>
            <span>Record Watch is enabled once the match has kicked off.</span>
          </div>
        )}

        {/* Presets Grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <PresetButton label="Full Match (90')" active={preset === "FULL"} onClick={() => applyPreset("FULL")} />
          <PresetButton label="First Half (0–45')" active={preset === "FIRST_HALF"} onClick={() => applyPreset("FIRST_HALF")} />
          <PresetButton label="Second Half (45–90')" active={preset === "SECOND_HALF"} onClick={() => applyPreset("SECOND_HALF")} />
          <PresetButton label="Custom Range" active={preset === "CUSTOM"} onClick={() => setPreset("CUSTOM")} />
        </div>

        {/* Custom Duration Slider */}
        {preset === "CUSTOM" && (
          <div className="mb-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <DurationSlider max={max} start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
          </div>
        )}

        {/* Watched Duration HUD Box */}
        <div className="flex items-center justify-between mb-6 rounded-2xl bg-white/[0.04] border border-white/10 px-5 py-3.5 shadow-inner">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Watched Range</p>
            <p className="text-base font-extrabold text-white tabular-nums">{start}' – {end}' min</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Logged</p>
            <p className="text-lg font-black text-emerald-400 tabular-nums">{duration} min</p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-400">
            {error}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex gap-2.5">
          {existingWatch && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-3 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition-all disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || duration <= 0 || (!existingWatch && !canRecord)}
            className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-xs sm:text-sm hover:bg-emerald-400 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 transition-all shadow-lg shadow-emerald-500/20"
          >
            {saving ? "Saving..." : existingWatch ? "Save Changes" : !canRecord ? "Only After Kickoff" : "Confirm Watch"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`py-3 px-3 rounded-xl text-xs font-bold border transition-all ${
        active
          ? "bg-emerald-500 text-black border-emerald-500 shadow-md shadow-emerald-500/20 scale-[1.02]"
          : "bg-white/[0.04] text-slate-300 border-white/10 hover:border-emerald-500/40 hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
}

// Dual-handle range slider with smooth drag
function DurationSlider({
  max,
  start,
  end,
  onChange,
}: {
  max: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const pctFor = (v: number) => (v / max) * 100;

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * max);
    },
    [max]
  );

  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (!dragging) return;
      const value = valueFromClientX(clientX);
      if (dragging === "start") {
        onChange(Math.min(value, end - 1), end);
      } else {
        onChange(start, Math.max(value, start + 1));
      }
    },
    [dragging, valueFromClientX, start, end, onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => handlePointerMove(e.clientX);
    const onUp = () => setDragging(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, handlePointerMove]);

  return (
    <div className="px-1 py-4 select-none">
      <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-3 tabular-nums">
        <span>0'</span>
        <span>{Math.round(max / 2)}'</span>
        <span>{max}'</span>
      </div>
      <div ref={trackRef} className="relative h-2.5 rounded-full bg-slate-800 touch-none">
        <div
          className="absolute h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-sm"
          style={{ left: `${pctFor(start)}%`, width: `${pctFor(end - start)}%` }}
        />
        <Handle position={pctFor(start)} onDown={() => setDragging("start")} label={`${start}'`} />
        <Handle position={pctFor(end)} onDown={() => setDragging("end")} label={`${end}'`} />
      </div>
    </div>
  );
}

function Handle({ position, onDown, label }: { position: number; onDown: () => void; label: string }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 touch-none z-10"
      style={{ left: `${position}%` }}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
    >
      <div className="relative flex flex-col items-center">
        <div className="mb-1 px-1.5 py-0.5 rounded-md bg-[#161e2c] border border-emerald-500/40 text-emerald-400 text-[10px] font-extrabold whitespace-nowrap shadow-md">
          {label}
        </div>
        <div className="h-6 w-6 rounded-full bg-emerald-400 border-2 border-[#080b10] shadow-lg shadow-emerald-500/40 cursor-grab active:cursor-grabbing hover:scale-115 transition-transform" />
      </div>
    </div>
  );
}
