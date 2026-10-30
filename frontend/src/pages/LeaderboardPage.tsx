import { useState } from "react";
import { Link } from "react-router-dom";
import { useLeaderboard } from "../hooks/queries";
import { useAuth } from "../context/AuthContext";
import { LoadingState, EmptyState } from "../components/States";

const TYPES = [
  { value: "minutes", label: "Minutes Watched" },
  { value: "matches", label: "Matches Watched" },
];
const SCOPES = [
  { value: "all-time", label: "All Time" },
  { value: "season", label: "Season" },
  { value: "monthly", label: "This Month" },
];

export function LeaderboardPage() {
  const [type, setType] = useState("minutes");
  const [scope, setScope] = useState("all-time");
  const { user } = useAuth();
  const { data, isLoading } = useLeaderboard(type, scope);

  const entries = data?.entries ?? [];
  const top3 = entries.slice(0, 3);
  const remaining = entries.slice(3);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Community Leaderboard</h1>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
          See who is watching the most football across the platform
        </p>
      </div>

      {/* Type & Scope Segmented Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="glass-panel p-1 rounded-2xl flex gap-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                type === t.value
                  ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                scope === s.value
                  ? "bg-white/10 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingState label="Loading leaderboard standings..." />}
      {entries.length === 0 && !isLoading && <EmptyState title="No leaderboard data recorded yet" />}

      {/* Podium for Top 3 */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* 1st Place */}
          {top3[0] && (
            <PodiumCard
              rank={1}
              userId={top3[0].userId}
              username={top3[0].username}
              avatar={top3[0].avatar}
              value={top3[0].value}
              type={type}
              isMe={top3[0].userId === user?.id}
              badge="🥇 1st"
              accentColor="border-amber-400/50 bg-amber-500/10 text-amber-300"
            />
          )}

          {/* 2nd Place */}
          {top3[1] && (
            <PodiumCard
              rank={2}
              userId={top3[1].userId}
              username={top3[1].username}
              avatar={top3[1].avatar}
              value={top3[1].value}
              type={type}
              isMe={top3[1].userId === user?.id}
              badge="🥈 2nd"
              accentColor="border-slate-300/40 bg-slate-300/10 text-slate-200"
            />
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <PodiumCard
              rank={3}
              userId={top3[2].userId}
              username={top3[2].username}
              avatar={top3[2].avatar}
              value={top3[2].value}
              type={type}
              isMe={top3[2].userId === user?.id}
              badge="🥉 3rd"
              accentColor="border-amber-600/40 bg-amber-700/10 text-amber-500"
            />
          )}
        </div>
      )}

      {/* Positions 4 and below */}
      {remaining.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Standings
          </h2>
          <div className="space-y-2">
            {remaining.map((entry, idx) => {
              const isMe = entry.userId === user?.id;
              const position = idx + 4;
              const profileLink = isMe ? "/profile" : `/users/${entry.userId}`;

              return (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between rounded-2xl p-3.5 transition-all ${
                    isMe
                      ? "bg-emerald-500/10 border border-emerald-500/50 shadow-sm"
                      : "bg-white/[0.03] hover:bg-white/[0.05] border border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center text-xs font-black text-slate-500 shrink-0">
                      {position}
                    </span>
                    <Link
                      to={profileLink}
                      viewTransition
                      className="w-9 h-9 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center border border-white/10 shrink-0 hover:scale-105 transition-transform"
                    >
                      {entry.avatar ? (
                        <img src={entry.avatar} alt={entry.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-black text-emerald-400">
                          {entry.username[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </Link>
                    <Link
                      to={profileLink}
                      viewTransition
                      className="text-sm font-bold text-slate-200 hover:text-emerald-400 transition-colors truncate"
                    >
                      {entry.username}
                      {isMe && (
                        <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-black uppercase">
                          You
                        </span>
                      )}
                    </Link>
                  </div>
                  <span className="text-xs font-black text-emerald-400 tabular-nums shrink-0 ml-3">
                    {entry.value.toLocaleString()}{type === "minutes" ? " min" : " matches"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PodiumCard({
  badge,
  userId,
  username,
  avatar,
  value,
  type,
  isMe,
  accentColor,
}: {
  rank: number;
  badge: string;
  userId: string;
  username: string;
  avatar: string | null;
  value: number;
  type: string;
  isMe: boolean;
  accentColor: string;
}) {
  const profileLink = isMe ? "/profile" : `/users/${userId}`;

  return (
    <div
      className={`rounded-2xl border p-4 text-center relative overflow-hidden flex flex-col items-center justify-center transition-all ${accentColor} ${
        isMe ? "ring-2 ring-emerald-400" : ""
      }`}
    >
      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/10 mb-2.5">
        {badge}
      </span>

      {/* PFP Avatar */}
      <Link
        to={profileLink}
        viewTransition
        className="relative group cursor-pointer mb-2 transition-transform hover:scale-105 active:scale-95"
      >
        <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden border-2 border-white/20 shadow-md">
          {avatar ? (
            <img src={avatar} alt={username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-emerald-400">
              {username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>
      </Link>

      <Link
        to={profileLink}
        viewTransition
        className="text-base font-extrabold text-white hover:text-emerald-400 transition-colors truncate max-w-[140px] block"
      >
        {username}
      </Link>

      {isMe && (
        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider mt-0.5">
          (You)
        </span>
      )}
      <p className="text-xl font-black text-white mt-2 tabular-nums">
        {value.toLocaleString()}
        <span className="text-xs font-normal text-slate-300 ml-1">
          {type === "minutes" ? "m" : " matches"}
        </span>
      </p>
    </div>
  );
}
