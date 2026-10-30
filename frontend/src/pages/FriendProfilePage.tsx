import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useUserProfile, useStats, useLeaderboard } from "../hooks/queries";
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
  const userStats = useStats("all-time", id);
  const leaderboard = useLeaderboard("minutes", "all-time");
  const qc = useQueryClient();
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "stats">("overview");

  if (isLoading) return <LoadingState label="Loading profile..." />;
  if (isError || !data?.profile) return <ErrorState message="Couldn't load this profile." onRetry={refetch} />;

  const p = data.profile;
  const isMe = currentUser?.id === p.id;
  const supportedTeamStyle = p.supportedTeam ? getClubStyle(p.supportedTeam.name) : null;

  const position = leaderboard.data?.entries.findIndex((e) => e.userId === id);
  const rank = position !== undefined && position >= 0 ? position + 1 : null;
  const mostWatched = userStats.data?.watching.mostWatchedTeam;

  async function handleSendRequest() {
    if (!id || actionPending || isMe) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.post("/friends/requests", { receiverId: id });
      await qc.invalidateQueries({ queryKey: ["user-profile", id] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    } catch (err: any) {
      setActionError(err?.message || "Failed to send friend request");
    } finally {
      setActionPending(false);
    }
  }

  async function handleAcceptRequest() {
    if (actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      if (p.friendRequestId) {
        await api.post(`/friends/requests/${p.friendRequestId}/accept`);
      } else {
        await api.post("/friends/requests", { receiverId: id });
      }
      await qc.invalidateQueries({ queryKey: ["user-profile", id] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    } catch (err: any) {
      setActionError(err?.message || "Failed to accept friend request");
    } finally {
      setActionPending(false);
    }
  }

  async function handleDeclineRequest() {
    if (!p.friendRequestId || actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.post(`/friends/requests/${p.friendRequestId}/decline`);
      await qc.invalidateQueries({ queryKey: ["user-profile", id] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    } catch (err: any) {
      setActionError(err?.message || "Failed to decline friend request");
    } finally {
      setActionPending(false);
    }
  }

  async function handleCancelRequest() {
    if (!p.friendRequestId || actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.post(`/friends/requests/${p.friendRequestId}/cancel`);
      await qc.invalidateQueries({ queryKey: ["user-profile", id] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel friend request");
    } finally {
      setActionPending(false);
    }
  }

  async function handleRemoveFriend() {
    if (!id || actionPending) return;
    if (!window.confirm(`Are you sure you want to remove ${p.username} from your friends?`)) return;
    setActionPending(true);
    setActionError(null);
    try {
      await api.delete(`/friends/${id}`);
      await qc.invalidateQueries({ queryKey: ["user-profile", id] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    } catch (err: any) {
      setActionError(err?.message || "Failed to remove friend");
    } finally {
      setActionPending(false);
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
                  <strong className="text-white font-extrabold">{p.friendsCount ?? (p.isFriend ? 1 : 0)}</strong>{" "}
                  {(p.friendsCount ?? (p.isFriend ? 1 : 0)) === 1 ? "Friend" : "Friends"}
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
            ) : p.isFriend || p.friendStatus === "FRIENDS" ? (
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 shadow-sm">
                  <span>✓</span>
                  <span>Friends</span>
                </span>
                <button
                  type="button"
                  onClick={handleRemoveFriend}
                  disabled={actionPending}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
                  title="Remove Friend"
                >
                  {actionPending ? "..." : "Unfriend"}
                </button>
              </div>
            ) : p.friendStatus === "OUTGOING_PENDING" ? (
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/[0.06] border border-white/15 text-slate-300 flex items-center gap-1.5">
                  <span className="animate-pulse">⌛</span>
                  <span>Request Sent</span>
                </span>
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  disabled={actionPending}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
                  title="Cancel Request"
                >
                  {actionPending ? "..." : "Cancel"}
                </button>
              </div>
            ) : p.friendStatus === "INCOMING_PENDING" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAcceptRequest}
                  disabled={actionPending}
                  className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-500 text-black hover:bg-emerald-400 shadow-md shadow-emerald-500/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  {actionPending ? "..." : "Accept Request"}
                </button>
                <button
                  type="button"
                  onClick={handleDeclineRequest}
                  disabled={actionPending}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all cursor-pointer"
                >
                  Decline
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSendRequest}
                disabled={actionPending}
                className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>+</span>
                <span>{actionPending ? "Sending..." : "Add Friend"}</span>
              </button>
            )}
            {actionError && (
              <span className="text-[11px] text-rose-400 font-medium">{actionError}</span>
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
            <div className="flex flex-col items-center justify-center p-2">
              <div className="text-2xl font-black tabular-nums tracking-tight min-h-[32px] flex items-center justify-center text-emerald-400">
                {p.totalMatches ?? userStats.data?.watching.totalMatches ?? 0}
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Matches Watched
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-2">
              <div className="text-2xl font-black tabular-nums tracking-tight min-h-[32px] flex items-center justify-center text-cyan-400">
                {(p.totalMinutes ?? userStats.data?.watching.totalMinutes ?? 0).toLocaleString()}'
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Minutes Watched
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-2">
              <div className="text-2xl font-black tabular-nums tracking-tight min-h-[32px] flex items-center justify-center text-emerald-400">
                {mostWatched ? (
                  <Link
                    to={`/teams/${mostWatched.id}`}
                    viewTransition
                    className="inline-flex items-center justify-center gap-1.5 hover:text-emerald-300 transition-colors max-w-full px-1"
                    title={`${mostWatched.name} (${mostWatched.matches} ${mostWatched.matches === 1 ? 'match' : 'matches'})`}
                  >
                    {mostWatched.logoUrl && (
                      <img
                        src={mostWatched.logoUrl}
                        alt=""
                        className="w-5 h-5 object-contain inline flex-shrink-0"
                      />
                    )}
                    <span className="truncate max-w-[110px] text-base font-extrabold text-white hover:text-emerald-400">
                      {mostWatched.name}
                    </span>
                  </Link>
                ) : (
                  "—"
                )}
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Most Watched Club
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-2">
              <div className="text-2xl font-black tabular-nums tracking-tight min-h-[32px] flex items-center justify-center text-amber-400">
                {rank ? `#${rank}` : "—"}
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">
                Global Rank
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
