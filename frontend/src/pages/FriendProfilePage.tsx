import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useUserProfile } from "../hooks/queries";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { LoadingState, ErrorState } from "../components/States";
import { getClubStyle } from "../lib/clubColors";
import { UserStatsView } from "../components/UserStatsView";

export function FriendProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data, isLoading, isError, refetch } = useUserProfile(id);
  const qc = useQueryClient();
  const [followPending, setFollowPending] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "stats">("overview");

  if (isLoading) return <LoadingState label="Loading profile..." />;
  if (isError || !data?.profile) return <ErrorState message="Couldn't load this profile." onRetry={refetch} />;

  const p = data.profile;
  const isMe = currentUser?.id === p.id;
  const supportedTeamStyle = p.supportedTeam ? getClubStyle(p.supportedTeam.name) : null;

  async function handleToggleFollow() {
    if (!id || followPending || isMe) return;
    setFollowPending(true);
    try {
      if (p.isFollowing) {
        await api.delete(`/users/${id}/follow`);
      } else {
        await api.post(`/users/${id}/follow`);
      }
      qc.invalidateQueries({ queryKey: ["user-profile", id] });
      qc.invalidateQueries({ queryKey: ["friends"] });
    } catch (err) {
      console.error("Follow toggle failed:", err);
    } finally {
      setFollowPending(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate("/leaderboard");
          }
        }}
        className="text-xs font-bold text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1.5 cursor-pointer group transition-colors"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
        <span>Back</span>
      </button>

      {/* Profile Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-b from-[#111927]/90 to-[#0c121e]/90 border border-white/10 backdrop-blur-xl shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* PFP Avatar */}
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-2xl font-black text-black shadow-lg shadow-emerald-500/20 shrink-0 overflow-hidden border border-white/10">
              {p.avatar ? (
                <img src={p.avatar} alt={p.username} className="w-full h-full object-cover" />
              ) : (
                p.username[0]?.toUpperCase() ?? "U"
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-white tracking-tight">{p.username}</h1>
                {isMe && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-black uppercase">
                    You
                  </span>
                )}
                {p.isFriend && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Friends
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span>@{p.username}</span>
                <span>•</span>
                <span>Member since {new Date(p.memberSince).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                <span>
                  <strong className="text-white font-extrabold">{p.followersCount ?? 0}</strong> Followers
                </span>
                <span>•</span>
                <span>
                  <strong className="text-white font-extrabold">{p.followingCount ?? 0}</strong> Following
                </span>
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto self-start sm:self-auto">
            {isMe ? (
              <Link
                to="/profile"
                viewTransition
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Go to My Profile →
              </Link>
            ) : (
              <>
                <button
                  onClick={handleToggleFollow}
                  disabled={followPending}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                    p.isFollowing
                      ? "bg-white/[0.06] text-emerald-400 border border-emerald-500/40 hover:bg-white/[0.1] hover:scale-[1.02] active:scale-[0.98]"
                      : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20"
                  }`}
                >
                  {p.isFollowing ? "✓ Following" : "+ Follow User"}
                </button>
                {p.isFollowedBy && !p.isFollowing && (
                  <span className="text-[11px] text-emerald-400 font-medium">Follows you</span>
                )}
                {p.isFollowedBy && p.isFollowing && (
                  <span className="text-[11px] text-emerald-400 font-medium">Mutual Follow · Friends</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Supported Club Card if set */}
        {p.supportedTeam && supportedTeamStyle && (
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center p-1 border shadow-sm"
                style={{
                  background: supportedTeamStyle.background,
                  borderColor: supportedTeamStyle.borderColor,
                }}
              >
                {p.supportedTeam.logoUrl ? (
                  <img src={p.supportedTeam.logoUrl} alt="" className="w-6 h-6 object-contain" />
                ) : (
                  <span className="text-xs font-black" style={{ color: supportedTeamStyle.textColor }}>
                    {p.supportedTeam.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Supported Club
                </p>
                <p className="text-sm font-black text-white">{p.supportedTeam.name}</p>
              </div>
            </div>
            <Link
              to={`/teams/${p.supportedTeam.id}`}
              viewTransition
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              View Team Page →
            </Link>
          </div>
        )}
      </div>

      {/* Tabs: Overview vs Full Stats & Activity */}
      <div className="glass-panel p-1 rounded-2xl flex gap-1 self-start">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "overview"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span>👤</span>
          <span>Overview</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "stats"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span>📊</span>
          <span>Full Stats & History</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md shadow-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2">
              <p className="text-2xl font-black tabular-nums tracking-tight text-emerald-400">
                {p.totalMatches ?? 0}
              </p>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Matches Watched
              </p>
            </div>
            <div className="p-2">
              <p className="text-2xl font-black tabular-nums tracking-tight text-cyan-400">
                {(p.totalMinutes ?? 0).toLocaleString()}'
              </p>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Minutes Watched
              </p>
            </div>
            <div className="p-2">
              <p className="text-2xl font-black tabular-nums tracking-tight text-amber-400">
                {p.currentStreak ?? 0} 🔥
              </p>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Active Streak
              </p>
            </div>
            <div className="p-2">
              <p className="text-2xl font-black tabular-nums tracking-tight text-purple-400">
                {p.longestStreak ?? 0}
              </p>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Longest Streak
              </p>
            </div>
          </div>

          {/* Call to action for full stats */}
          <div
            onClick={() => setActiveTab("stats")}
            className="p-5 rounded-3xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-cyan-500/10 border border-emerald-500/30 hover:border-emerald-500/60 transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
          >
            <div>
              <h3 className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                <span>📊</span>
                <span>View Complete Match & Prediction Breakdown</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Explore @{p.username}'s predictions accuracy, Player of the Match voting history, and verified matches log.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition-transform self-start sm:self-auto flex items-center gap-1 shrink-0">
              <span>View All Stats</span>
              <span>→</span>
            </span>
          </div>
        </div>
      )}

      {/* Tab 2: Full Stats & History */}
      {activeTab === "stats" && (
        <UserStatsView userId={p.id} userName={p.username} showHeader={false} />
      )}
    </div>
  );
}
