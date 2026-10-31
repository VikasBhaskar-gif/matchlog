import { useState, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStats, useMyFollows, useLeaderboard } from "../hooks/queries";
import { LoadingState } from "../components/States";
import { getClubStyle } from "../lib/clubColors";
import { LEAGUE_LOGOS, sortCompetitions } from "../lib/competitions";
import { playerInitials } from "../lib/format";
import { SupportedTeamModal } from "../components/SupportedTeamModal";
import { ImageCropModal } from "../components/ImageCropModal";

export function ProfilePage() {
  const { user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [isCropOpen, setIsCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useStats("all-time");
  const follows = useMyFollows();
  const leaderboard = useLeaderboard("minutes", "all-time");

  if (!user) return null;

  const position = leaderboard.data?.entries.findIndex((e) => e.userId === user.id);
  const rank = position !== undefined && position >= 0 ? position + 1 : null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (PNG, JPG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCropComplete(croppedDataUrl: string) {
    setIsCropOpen(false);
    setCropImageSrc("");
    setUploadingAvatar(true);
    try {
      await updateProfile({ avatar: croppedDataUrl });
    } catch (err: any) {
      alert(err?.message || "Failed to upload image.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  const followedTeams = follows.data?.teams ?? [];
  const followedCompsRaw = follows.data?.competitions ?? [];
  const followedCompIds = useMemo(() => new Set(followedCompsRaw.map((c) => c.id)), [followedCompsRaw]);
  const followedComps = useMemo(() => {
    return sortCompetitions(followedCompsRaw, followedCompIds, followedTeams);
  }, [followedCompsRaw, followedCompIds, followedTeams]);
  const followedPlayers = follows.data?.players ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Hidden file input for uploading from PC */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleAvatarFile}
        className="hidden"
      />

      {/* User Header Profile */}
      <div className="p-6 rounded-3xl bg-gradient-to-b from-[#111927]/90 to-[#0c121e]/90 border border-white/10 backdrop-blur-xl shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Clickable Profile Picture */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Click to upload profile picture from PC"
              className="h-16 w-16 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-2xl font-black text-black shadow-lg shadow-emerald-500/20 shrink-0 overflow-hidden relative border-2 border-emerald-400/50 group cursor-pointer hover:scale-105 active:scale-95 transition-all"
            >
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username[0]?.toUpperCase()
              )}

              {/* Hover overlay with camera icon */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                <span className="text-sm">📷</span>
                <span className="text-[8px] font-black uppercase tracking-wider">Change</span>
              </div>

              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-emerald-400 text-xs font-bold animate-pulse">
                  ...
                </div>
              )}
            </button>

            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {user.username}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-slate-400">@{user.username}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={handleLogout}
              className="text-xs font-bold px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Supported Club Card (Strictly 1 Team) */}
        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {user.supportedTeam ? (
              (() => {
                const style = getClubStyle(user.supportedTeam.name);
                return (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center p-1.5 shadow-md border"
                      style={{
                        background: style.badgeBg || "rgba(255,255,255,0.08)",
                        borderColor: style.borderColor || "rgba(255,255,255,0.1)",
                      }}
                    >
                      {user.supportedTeam.logoUrl ? (
                        <img
                          src={user.supportedTeam.logoUrl}
                          alt={user.supportedTeam.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-sm font-black">⚽</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                        Supported Club (1 allowed)
                      </span>
                      <p className="text-sm font-extrabold text-white">{user.supportedTeam.name}</p>
                    </div>
                  </div>
                );
              })()
            ) : user.onboardingCompleted ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-xl shadow-md">
                  ⚖️
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                    Supported Club (1 allowed)
                  </span>
                  <p className="text-sm font-extrabold text-white">Neutral Fan (No specific club)</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-slate-400">
                <span className="text-lg">👕</span>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Supported Club
                  </span>
                  <p className="text-xs text-slate-400">No supported club chosen yet</p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsEditOpen(true)}
            className="text-xs font-semibold text-slate-300 hover:text-emerald-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-1.5 rounded-xl transition-colors self-start sm:self-auto"
          >
            {user.supportedTeam ? "Change Club →" : "Choose Club →"}
          </button>
        </div>
      </div>

      <SupportedTeamModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />

      <ImageCropModal
        isOpen={isCropOpen}
        imageSrc={cropImageSrc}
        onClose={() => setIsCropOpen(false)}
        onCropComplete={handleCropComplete}
      />

      {stats.isLoading && <LoadingState label="Loading profile..." />}

      {stats.data && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md shadow-lg">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Mini label="Matches Watched" value={stats.data.watching.totalMatches} color="text-emerald-400" />
            <Mini label="Minutes Watched" value={`${stats.data.watching.totalMinutes.toLocaleString()}'`} color="text-cyan-400" />
            <Mini
              label="Most Watched Club"
              value={
                stats.data.watching.mostWatchedTeam ? (
                  <Link
                    to={`/teams/${stats.data.watching.mostWatchedTeam.id}`}
                    viewTransition
                    className="inline-flex items-center justify-center gap-1.5 hover:text-emerald-400 transition-colors max-w-full px-1"
                    title={`${stats.data.watching.mostWatchedTeam.name} (${stats.data.watching.mostWatchedTeam.matches} ${stats.data.watching.mostWatchedTeam.matches === 1 ? 'match' : 'matches'})`}
                  >
                    {stats.data.watching.mostWatchedTeam.logoUrl && (
                      <img
                        src={stats.data.watching.mostWatchedTeam.logoUrl}
                        alt=""
                        className="w-5 h-5 object-contain inline flex-shrink-0"
                      />
                    )}
                    <span className="truncate max-w-[110px] text-base font-extrabold text-white hover:text-emerald-400">
                      {stats.data.watching.mostWatchedTeam.name}
                    </span>
                  </Link>
                ) : (
                  "—"
                )
              }
              color="text-emerald-400"
            />
            <Mini label="Global Rank" value={rank ? `#${rank}` : "—"} color="text-amber-400" />
          </div>
        </div>
      )}

      {/* Followed Teams with Jersey Colors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="text-emerald-400">❖</span>
            <span>Followed Clubs ({followedTeams.length})</span>
          </h2>
          <Link to="/teams" viewTransition className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Browse all →
          </Link>
        </div>

        {followedTeams.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">No followed clubs yet. Follow clubs to see them in their jersey colors.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {followedTeams.map((team) => {
              const style = getClubStyle(team.name);
              return (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  viewTransition
                  style={{
                    background: style.background,
                    color: style.textColor,
                    borderColor: style.borderColor,
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all group overflow-hidden relative"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 p-1.5 shadow-sm"
                    style={{ background: style.badgeBg ?? "rgba(0,0,0,0.35)" }}
                  >
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain group-hover:scale-110 transition-transform" />
                    ) : (
                      <span className="text-xs font-black">{team.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-sm truncate drop-shadow-sm">{team.name}</p>
                    {team.country && (
                      <p className="text-[11px] opacity-80 truncate">{team.country}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Followed Competitions with official logos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="text-cyan-400">❖</span>
            <span>Followed Leagues ({followedComps.length})</span>
          </h2>
          <Link to="/leagues" viewTransition className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            League standings →
          </Link>
        </div>

        {followedComps.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">No followed leagues yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {followedComps.map((comp) => {
              const logo = LEAGUE_LOGOS[comp.name] || comp.logoUrl;
              return (
                <Link
                  key={comp.id}
                  to={`/leagues?id=${comp.id}`}
                  viewTransition
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-emerald-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0 p-2.5 shadow-inner group-hover:border-emerald-500/30 group-hover:scale-105 transition-transform">
                    {logo ? (
                      <img src={logo} alt={comp.name} className="w-full h-full object-contain drop-shadow" />
                    ) : (
                      <span className="text-sm font-black text-emerald-400">⚽</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-sm text-slate-200 group-hover:text-emerald-400 transition-colors truncate">
                      {comp.name}
                    </p>
                    {comp.country && <p className="text-[11px] text-slate-400 truncate">{comp.country}</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Followed Players with Team Jersey Colors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span className="text-amber-400">❖</span>
            <span>Followed Players ({followedPlayers.length})</span>
          </h2>
          <Link to="/players" viewTransition className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Browse players →
          </Link>
        </div>

        {followedPlayers.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">No followed players yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {followedPlayers.map((player) => (
              <Link
                key={player.id}
                to={`/players/${player.id}`}
                viewTransition
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-emerald-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] group"
              >
                {/* Clean Circular Profile Picture without color background */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10 bg-white/[0.05] shadow-sm relative group-hover:scale-105 transition-transform">
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="text-xs font-black text-slate-300 tracking-wider">
                      {playerInitials(player.name)}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-sm text-slate-200 group-hover:text-emerald-400 transition-colors truncate">
                    {player.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate mt-0.5">
                    {player.teamBadgeUrl && (
                      <img src={player.teamBadgeUrl} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
                    )}
                    <span className="truncate">{player.teamName ?? player.nationality ?? "Player"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-2">
      <div className={`text-2xl font-black tabular-nums tracking-tight min-h-[32px] flex items-center justify-center ${color ?? "text-white"}`}>
        {value}
      </div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">{label}</p>
    </div>
  );
}
