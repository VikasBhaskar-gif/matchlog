import { useState, useMemo, useEffect, useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import { useCompetitions, useTeams } from "../hooks/queries";
import { LEAGUE_LOGOS } from "../lib/competitions";
import { getClubStyle } from "../lib/clubColors";
import { ImageCropModal } from "../components/ImageCropModal";
import { api } from "../api/client";
import type { Competition, Team } from "../api/types";

type SelectionValue =
  | "NEUTRAL"
  | Team
  | null;

export function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();

  // Wizard step: 1 = credentials, 2 = choose supported club
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Credentials
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Step 2: Club Selection
  const [selection, setSelection] = useState<SelectionValue>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState("");
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [isCropOpen, setIsCropOpen] = useState(false);
  const regFileInputRef = useRef<HTMLInputElement>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);

  const { data: compData, isLoading: compsLoading } = useCompetitions();

  // If already logged in, redirect
  if (user) {
    return <Navigate to="/" replace />;
  }

  // Filter out tournaments (Champions League) and prioritize domestic leagues
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

  // Set default league to Premier League or first
  useEffect(() => {
    if (sortedLeagues.length > 0 && !selectedLeagueId) {
      const prem =
        sortedLeagues.find((c) => c.name === "Premier League") || sortedLeagues[0];
      setSelectedLeagueId(prem.id);
    }
  }, [sortedLeagues, selectedLeagueId]);

  // Fetch teams for selected league
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

  const isNeutral = selection === "NEUTRAL";
  const selectedTeam = selection && selection !== "NEUTRAL" ? selection : null;

  // Step 1: Validate and verify username availability before moving to Step 2
  async function handleProceedToStep2(e: React.FormEvent) {
    e.preventDefault();
    const cleanUser = username.trim();

    if (/\s/.test(username)) {
      setError("Username cannot contain spaces.");
      return;
    }
    if (!cleanUser) {
      setError("Please choose a username.");
      return;
    }
    if (cleanUser.length < 3 || cleanUser.length > 30) {
      setError("Username must be between 3 and 30 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
      setError("Username may only contain letters, numbers, underscores, dots, or hyphens (no spaces).");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setCheckingUsername(true);
    setError(null);
    try {
      const res = await api.get<{ available: boolean }>(
        `/auth/check-username?username=${encodeURIComponent(cleanUser)}`
      );
      if (!res.available) {
        setError("This username is already taken. Please choose another username.");
        return;
      }
      // Username is available, advance to Step 2! (Account is NOT created yet)
      setStep(2);
    } catch (err: any) {
      setError(err?.message || "Could not verify username. Please try again.");
    } finally {
      setCheckingUsername(false);
    }
  }

  // Step 2: Finalize account creation WITH the selected club (or neutral)
  async function handleFinalizeRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!selection) {
      setError("Please choose either a club or select 'No Club (Neutral Fan)' to complete your registration.");
      return;
    }

    setCreatingAccount(true);
    setError(null);
    try {
      await register(username.trim(), password, {
        supportedTeamId: isNeutral ? null : selectedTeam?.id,
        avatar: avatar.trim() || null,
        onboardingCompleted: true,
      });
      // Registration successful! Redirect to home
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
      setCreatingAccount(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#080b10] text-[#f1f5f9]">
      {step === 1 ? (
        /* STEP 1: Enter Username & Password */
        <div className="w-full max-w-sm">
          <div className="text-3xl font-black tracking-tight mb-2 text-center text-white">
            Match<span className="text-emerald-400">log</span>
          </div>
          <p className="text-sm text-slate-400 text-center mb-6">
            Create your account with a permanent username.
          </p>

          <form onSubmit={handleProceedToStep2} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => {
                  const val = e.target.value.replace(/\s+/g, "");
                  setUsername(val);
                  if (error) setError(null);
                }}
                placeholder="Choose a username"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 focus:border-emerald-400 outline-none text-sm text-white placeholder-slate-500 transition-colors"
                autoComplete="username"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1 px-0.5">
                No spaces. 3-30 characters (letters, numbers, _, -, .).
              </p>
              <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                <span className="text-sm shrink-0">⚠️</span>
                <p className="leading-snug">
                  <strong>Important:</strong> Your username can only be set once during registration and <u>cannot</u> be changed later.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                type="password"
                placeholder="Min. 6 characters"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 focus:border-emerald-400 outline-none text-sm text-white placeholder-slate-500 transition-colors"
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={checkingUsername}
              className="w-full py-3 rounded-xl bg-emerald-400 text-black font-extrabold text-sm hover:bg-emerald-300 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-[0.99] flex items-center justify-center gap-1.5"
            >
              {checkingUsername ? (
                "Checking username..."
              ) : (
                <>
                  <span>Next: Choose Supported Club</span>
                  <span>→</span>
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-bold">
              Log in
            </Link>
          </p>
        </div>
      ) : (
        /* STEP 2: Choose Supported Club (Account only created on completion) */
        <div className="w-full max-w-2xl my-6 rounded-3xl bg-[#0c111a] border border-white/10 shadow-2xl p-5 sm:p-7 relative text-slate-100 max-h-[92vh] flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                  Step 2 of 2: Profile Setup
                </span>
                <span className="text-[10px] font-bold text-slate-400 bg-white/[0.05] border border-white/10 px-2 py-0.5 rounded-full">
                  Only 1 club allowed
                </span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight mt-1">
                Choose the Club You Support
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Registering as <strong className="text-emerald-400">@{username}</strong>. Choose your club or follow as neutral.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
              className="text-xs font-semibold text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 border border-white/10 transition-colors shrink-0"
            >
              ← Edit username
            </button>
          </div>

          {/* Form / Selection Body */}
          <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-5 py-4 min-h-0">
            {/* Option for No Club (Neutral Fan) */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setSelection("NEUTRAL");
                  setError(null);
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left ${
                  isNeutral
                    ? "bg-emerald-500/15 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.18)] ring-2 ring-emerald-500/50"
                    : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
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
                    const isSelected = selectedTeam?.id === team.id;
                    const style = getClubStyle(team.name);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => {
                          setSelection(team);
                          setError(null);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-2 ring-emerald-500 text-white font-bold"
                            : "bg-white/[0.02] border-white/10 hover:bg-white/[0.06] hover:border-white/20 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
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
                ref={regFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith("image/")) {
                    setError("Please select an image file (PNG, JPG, WebP).");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCropImageSrc(reader.result as string);
                    setIsCropOpen(true);
                  };
                  reader.readAsDataURL(file);
                  if (regFileInputRef.current) regFileInputRef.current.value = "";
                }}
                className="hidden"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => regFileInputRef.current?.click()}
                  title="Click to choose image from PC"
                  className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-base text-black shrink-0 overflow-hidden border-2 border-emerald-400/50 relative group hover:scale-105 transition-transform"
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
                    username[0]?.toUpperCase()
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">
                    📷
                  </div>
                </button>

                <div className="flex-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => regFileInputRef.current?.click()}
                    className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-slate-200 hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <span>📁</span>
                    <span>Choose from PC</span>
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

          {/* Action Footer */}
          <div className="pt-3 border-t border-white/10 shrink-0">
            <button
              type="button"
              onClick={handleFinalizeRegistration}
              disabled={creatingAccount || !selection}
              className="w-full py-3 rounded-xl bg-emerald-400 text-black font-extrabold text-sm hover:bg-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
            >
              {creatingAccount
                ? "Creating account..."
                : isNeutral
                ? "Create Account (Neutral Fan)"
                : selectedTeam
                ? `Create Account & Support ${selectedTeam.name}`
                : "Select an option to create account"}
            </button>
          </div>
        </div>
      )}

      <ImageCropModal
        isOpen={isCropOpen}
        imageSrc={cropImageSrc}
        onClose={() => {
          setIsCropOpen(false);
          setCropImageSrc("");
        }}
        onCropComplete={(croppedDataUrl) => {
          setAvatar(croppedDataUrl);
          setIsCropOpen(false);
          setCropImageSrc("");
        }}
      />
    </div>
  );
}
