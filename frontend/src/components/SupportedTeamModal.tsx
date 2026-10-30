import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useCompetitions, useTeams } from "../hooks/queries";
import { LEAGUE_LOGOS } from "../lib/competitions";
import { getClubStyle } from "../lib/clubColors";
import { processImageFile } from "../lib/imageUpload";
import type { Competition, Team } from "../api/types";

interface SupportedTeamModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isOnboarding?: boolean;
}

type SelectionValue =
  | "NEUTRAL"
  | Team
  | { id: string; name: string; logoUrl?: string | null }
  | null;

export function SupportedTeamModal({
  isOpen,
  onClose,
  isOnboarding = false,
}: SupportedTeamModalProps) {
  const { user, updateProfile } = useAuth();

  // Single mutually exclusive source of truth for choice:
  // "NEUTRAL" -> Neutral Fan (no club)
  // Team object -> Supported club
  // null -> None chosen yet
  const [selection, setSelection] = useState<SelectionValue>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState("");
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: compData, isLoading: compsLoading } = useCompetitions();

  // Filter out Champions League (tournaments) and sort domestic leagues
  const sortedLeagues = useMemo(() => {
    const list = (compData?.competitions ?? []).filter(
      (c) =>
        !c.name.toLowerCase().includes("champions league") &&
        !c.name.toLowerCase().includes("ucl")
    );
    const priority = [
      "Premier League",
      "La Liga",
      "Serie A",
      "Bundesliga",
      "Ligue 1",
    ];
    return [...list].sort((a, b) => {
      const idxA = priority.indexOf(a.name);
      const idxB = priority.indexOf(b.name);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [compData?.competitions]);

  // Set initial selected league to Premier League or first league
  useEffect(() => {
    if (sortedLeagues.length > 0 && !selectedLeagueId) {
      const prem =
        sortedLeagues.find((c) => c.name === "Premier League") || sortedLeagues[0];
      setSelectedLeagueId(prem.id);
    }
  }, [sortedLeagues, selectedLeagueId]);

  // Load existing user preferences on open
  useEffect(() => {
    if (user) {
      if (user.supportedTeamId && user.supportedTeam) {
        setSelection(user.supportedTeam);
      } else if (user.supportedTeamId) {
        setSelection({
          id: user.supportedTeamId,
          name: "Supported Club",
          logoUrl: null,
        });
      } else if (user.onboardingCompleted) {
        setSelection("NEUTRAL");
      } else {
        setSelection(null);
      }
      setAvatar(user.avatar || "");
    }
  }, [user, isOpen]);

  // Fetch teams in the currently selected league
  const { data: teamsData, isLoading: teamsLoading } = useTeams(
    selectedLeagueId ? { competitionId: selectedLeagueId } : undefined
  );

  const currentTeams = useMemo(() => {
    const list = teamsData?.teams ?? [];
    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase().trim();
    return list.filter((t) => t.name.toLowerCase().includes(q));
  }, [teamsData?.teams, searchFilter]);

  const activeLeague = useMemo(() => {
    return sortedLeagues.find((c) => c.id === selectedLeagueId) || null;
  }, [sortedLeagues, selectedLeagueId]);

  // Derived mutually exclusive states
  const isNeutral = selection === "NEUTRAL";
  const selectedTeam =
    selection && selection !== "NEUTRAL" ? selection : null;
  const selectedTeamId = selectedTeam?.id || null;

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen || !user) return null;

  function handleSelectNoClub() {
    setSelection("NEUTRAL");
    setError(null);
  }

  function handleSelectTeam(team: Team) {
    setSelection(team);
    setError(null);
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!selection) {
      setError("Please choose either a supported club or 'No Club (Neutral Fan)' to continue.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        supportedTeamId: isNeutral ? null : selectedTeam?.id,
        avatar: avatar.trim() || null,
        onboardingCompleted: true,
      });
      if (onClose) onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save your selection. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-2xl my-6 rounded-3xl bg-[#0c111a] border border-white/10 shadow-2xl p-5 sm:p-7 relative text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                {isOnboarding ? `Welcome @${user.username}` : "Support a Club"}
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-white/[0.05] border border-white/10 px-2 py-0.5 rounded-full">
                Single choice (Club OR Neutral)
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight mt-1">
              {isOnboarding ? "Choose the Club You Support" : "Change Your Supported Club"}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select your favorite club below, or choose to follow as a neutral fan.
            </p>
          </div>
          {!isOnboarding && onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-5 py-4 min-h-0">
          {/* Option for No Club (Neutral Fan) */}
          <div>
            <button
              type="button"
              onClick={handleSelectNoClub}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left ${
                isNeutral
                  ? "bg-emerald-500/15 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.18)] ring-2 ring-emerald-500/50"
                  : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20 text-slate-300"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Radio button circle */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isNeutral
                      ? "border-emerald-400 bg-emerald-500/20"
                      : "border-slate-500 bg-transparent"
                  }`}
                >
                  {isNeutral && (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  )}
                </div>

                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    isNeutral ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.05] text-slate-400"
                  }`}
                >
                  ⚖️
                </div>
                <div className="min-w-0">
                  <span className="font-extrabold text-sm text-white block">
                    No Club (Neutral Fan)
                  </span>
                  <p className="text-xs text-slate-400 truncate">
                    I don't support a specific team, I enjoy watching all games neutrally
                  </p>
                </div>
              </div>
              {isNeutral && (
                <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 rounded-full shrink-0 ml-2">
                  ✓ Selected
                </span>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink mx-3 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-[#0c111a] px-2">
              OR SELECT YOUR CLUB BY LEAGUE
            </span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          {/* League Options Tabs */}
          <div>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
              1. Choose League
            </span>
            {compsLoading ? (
              <div className="p-3 text-xs text-slate-400">Loading leagues...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {sortedLeagues.map((comp: Competition) => {
                  const isCompActive = selectedLeagueId === comp.id;
                  const logo = LEAGUE_LOGOS[comp.name] || comp.logoUrl;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => {
                        setSelectedLeagueId(comp.id);
                        setSearchFilter("");
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                        isCompActive
                          ? "bg-emerald-500/15 border-emerald-500/60 text-white font-bold ring-1 ring-emerald-500/40"
                          : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-slate-300"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center p-1 shrink-0">
                        {logo ? (
                          <img
                            src={logo}
                            alt={comp.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-xs">🏆</span>
                        )}
                      </div>
                      <span className="text-xs font-bold truncate leading-tight">
                        {comp.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Teams in Selected League */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Select Your Team {activeLeague ? `in ${activeLeague.name}` : ""}
              </span>
              {currentTeams.length > 8 && (
                <input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter team..."
                  className="px-3 py-1 text-xs rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 outline-none focus:border-emerald-400 w-36"
                />
              )}
            </div>

            {teamsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading teams...</div>
            ) : currentTeams.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 rounded-2xl border border-white/10 bg-white/[0.02]">
                No clubs found in this league
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {currentTeams.map((team: Team) => {
                  const isSelected = selectedTeamId === team.id;
                  const style = getClubStyle(team.name);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => handleSelectTeam(team)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-2 ring-emerald-500 text-white font-bold"
                          : "bg-white/[0.02] border-white/10 hover:bg-white/[0.06] hover:border-white/20 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Radio button circle */}
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "border-emerald-400 bg-emerald-500/20"
                              : "border-slate-500 bg-transparent"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          )}
                        </div>

                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center p-1 shrink-0"
                          style={{
                            background: style.badgeBg || "rgba(255,255,255,0.06)",
                          }}
                        >
                          {team.logoUrl ? (
                            <img
                              src={team.logoUrl}
                              alt={team.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-black">
                              {team.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate leading-tight">
                            {team.name}
                          </p>
                          {team.country && (
                            <p className="text-[10px] text-slate-500 truncate">
                              {team.country}
                            </p>
                          )}
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="text-xs font-black text-emerald-400 shrink-0 ml-1">
                          ✓ Supported
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 shrink-0 font-medium ml-1">
                          Select
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Profile Picture Option (Avatar) */}
          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Profile Picture (Optional)
              </label>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar("")}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                >
                  ✕ Remove picture
                </button>
              )}
            </div>

            <input
              ref={modalFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setProcessingAvatar(true);
                try {
                  const dataUrl = await processImageFile(file, 256);
                  setAvatar(dataUrl);
                } catch (err: any) {
                  setError(err?.message || "Failed to load image from PC.");
                } finally {
                  setProcessingAvatar(false);
                  if (modalFileInputRef.current) modalFileInputRef.current.value = "";
                }
              }}
              className="hidden"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => modalFileInputRef.current?.click()}
                title="Click to choose image from PC"
                className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-base text-black shrink-0 overflow-hidden border border-white/10 relative group hover:scale-105 transition-transform"
              >
                {avatar.trim() ? (
                  <img
                    src={avatar.trim()}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  user.username[0]?.toUpperCase()
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">
                  📷
                </div>
              </button>

              <div className="flex-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => modalFileInputRef.current?.click()}
                  disabled={processingAvatar}
                  className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-slate-200 hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                >
                  <span>📁</span>
                  <span>{processingAvatar ? "Loading..." : "Choose from PC"}</span>
                </button>
                <span className="text-[11px] text-slate-500">or</span>
                <input
                  value={avatar.startsWith("data:") ? "" : avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder={avatar.startsWith("data:") ? "Image loaded from PC ✓" : "Paste image URL"}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 focus:border-emerald-400 outline-none text-xs text-white placeholder-slate-500 transition-colors min-w-0"
                />
              </div>
            </div>
          </div>

          {/* Currently Selected Summary */}
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Currently Selected:</span>
            {isNeutral ? (
              <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                <span>⚖️</span> Neutral Fan (No Club)
              </span>
            ) : selectedTeam ? (
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
                {selectedTeam.logoUrl && (
                  <img
                    src={selectedTeam.logoUrl}
                    alt=""
                    className="w-4 h-4 object-contain"
                  />
                )}
                {selectedTeam.name}
              </span>
            ) : (
              <span className="text-xs text-slate-500 italic">None selected yet</span>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-semibold">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !selection}
            className="w-full py-3 rounded-xl bg-emerald-400 text-black font-extrabold text-sm hover:bg-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
          >
            {saving
              ? "Saving..."
              : isNeutral
              ? "Confirm (Neutral Fan)"
              : selectedTeam
              ? `Confirm (${selectedTeam.name})`
              : isOnboarding
              ? "Select an option to start exploring"
              : "Save Selection"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
