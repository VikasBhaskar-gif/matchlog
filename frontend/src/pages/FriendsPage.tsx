import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import {
  useFriends,
  useIncomingRequests,
  useOutgoingRequests,
  useFriendActivity,
  useFriendsLeaderboard,
  useUserSearch,
  useCompetitions,
} from "../hooks/queries";
import { useAuth } from "../context/AuthContext";
import { LoadingState, EmptyState } from "../components/States";
import type { FriendUser } from "../api/types";

type Tab = "friends" | "requests" | "activity" | "leaderboard";

export function FriendsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const incoming = useIncomingRequests();
  const pendingCount = incoming.data?.requests.length ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-4">Friends</h1>

      <UserSearch />

      <div className="flex gap-2 my-5 overflow-x-auto pb-1">
        <TabButton active={tab === "friends"} onClick={() => setTab("friends")} label="Friends" />
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")} label="Requests" badge={pendingCount} />
        <TabButton active={tab === "activity"} onClick={() => setTab("activity")} label="Activity" />
        <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} label="Leaderboard" />
      </div>

      {tab === "friends" && <FriendsList />}
      {tab === "requests" && <RequestsTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "leaderboard" && <LeaderboardTab />}
    </div>
  );
}

function TabButton({ active, onClick, label, badge }: { active: boolean; onClick: () => void; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
        active ? "bg-[var(--color-primary)] text-black" : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
      }`}
    >
      {label}
      {!!badge && (
        <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

function UserSearch() {
  const [query, setQuery] = useState("");
  const search = useUserSearch(query);
  const qc = useQueryClient();
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  async function sendRequest(userId: string) {
    await api.post("/friends/requests", { receiverId: userId });
    setSentTo((prev) => new Set(prev).add(userId));
    qc.invalidateQueries({ queryKey: ["friends"] });
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find friends by username..."
        className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
      />
      {query.trim().length >= 2 && (
        <div className="mt-2 space-y-2">
          {search.isLoading && <p className="text-xs text-[var(--color-text-dim)] px-1">Searching...</p>}
          {search.data?.users.length === 0 && <p className="text-xs text-[var(--color-text-dim)] px-1">No users found.</p>}
          {search.data?.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-center gap-2">
                <UserAvatar user={u} />
                <div>
                  <p className="text-sm font-semibold">{u.username}</p>
                </div>
              </div>
              <button
                onClick={() => sendRequest(u.id)}
                disabled={sentTo.has(u.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-black disabled:opacity-50"
              >
                {sentTo.has(u.id) ? "Sent" : "Add Friend"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserAvatar({ user }: { user: FriendUser }) {
  return (
    <div className="h-9 w-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-xs font-bold">
      {user.username[0]?.toUpperCase()}
    </div>
  );
}

function FriendsList() {
  const friends = useFriends();
  if (friends.isLoading) return <LoadingState label="Loading friends..." />;
  if (!friends.data || friends.data.friends.length === 0) {
    return <EmptyState title="No friends yet" subtitle="Search for someone above to send a friend request." />;
  }
  return (
    <div className="space-y-2">
      {friends.data.friends.map((f) => (
        <Link
          key={f.friendshipId}
          to={`/friends/${f.user.id}`}
          className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-primary)]/40"
        >
          <div className="flex items-center gap-3">
            <UserAvatar user={f.user} />
            <div>
              <p className="font-semibold text-sm">{f.user.username}</p>
            </div>
          </div>
          <RemoveFriendButton userId={f.user.id} />
        </Link>
      ))}
    </div>
  );
}

function RemoveFriendButton({ userId }: { userId: string }) {
  const qc = useQueryClient();
  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await api.delete(`/friends/${userId}`);
    qc.invalidateQueries({ queryKey: ["friends"] });
  }
  return (
    <button onClick={remove} className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-danger)] px-2 py-1">
      Remove
    </button>
  );
}

function RequestsTab() {
  const incoming = useIncomingRequests();
  const outgoing = useOutgoingRequests();
  const qc = useQueryClient();

  async function respond(id: string, action: "accept" | "decline") {
    await api.post(`/friends/requests/${id}/${action}`);
    qc.invalidateQueries({ queryKey: ["friends"] });
  }
  async function cancel(id: string) {
    await api.post(`/friends/requests/${id}/cancel`);
    qc.invalidateQueries({ queryKey: ["friends"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wide mb-2">Incoming</h2>
        {(incoming.data?.requests.length ?? 0) === 0 && <p className="text-sm text-[var(--color-text-dim)]">No incoming requests.</p>}
        <div className="space-y-2">
          {incoming.data?.requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-center gap-2">
                {r.sender && <UserAvatar user={r.sender} />}
                <p className="text-sm font-semibold">{r.sender?.username}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => respond(r.id, "accept")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-black">
                  Accept
                </button>
                <button onClick={() => respond(r.id, "decline")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-dim)]">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wide mb-2">Sent</h2>
        {(outgoing.data?.requests.length ?? 0) === 0 && <p className="text-sm text-[var(--color-text-dim)]">No outgoing requests.</p>}
        <div className="space-y-2">
          {outgoing.data?.requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-center gap-2">
                {r.receiver && <UserAvatar user={r.receiver} />}
                <p className="text-sm font-semibold">{r.receiver?.username}</p>
              </div>
              <button onClick={() => cancel(r.id)} className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-danger)]">
                Cancel
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityTab() {
  const activity = useFriendActivity();
  if (activity.isLoading) return <LoadingState label="Loading activity..." />;
  if (!activity.data || activity.data.activity.length === 0) {
    return <EmptyState title="No friend activity yet" subtitle="Once your friends watch matches or make predictions, it'll show up here." />;
  }
  return (
    <div className="space-y-2">
      {activity.data.activity.map((a) => (
        <div key={a.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          <span className="font-semibold">{a.user?.username ?? "Friend"}</span> {activityIcon(a.type)} {a.summary}
          <p className="text-[10px] text-[var(--color-text-dim)] mt-1">{new Date(a.createdAt).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case "WATCHED_MATCH": return "📺";
    case "MADE_PREDICTION": return "🎯";
    case "UNLOCKED_ACHIEVEMENT": return "🏅";
    case "REACHED_LEVEL": return "⬆️";
    default: return "";
  }
}

function LeaderboardTab() {
  const [metric, setMetric] = useState<"minutes" | "predictions">("minutes");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("all");
  const competitions = useCompetitions();

  const board = useFriendsLeaderboard(
    metric,
    metric === "predictions" ? selectedLeagueId : undefined
  );
  const { user } = useAuth();

  const leagues = useMemo(() => {
    return (competitions.data?.competitions ?? []).filter((c) => c.type === "league" || c.name.includes("League"));
  }, [competitions.data?.competitions]);

  return (
    <div className="space-y-4">
      {/* Metric Selector: Watched Minutes vs Prediction Points */}
      <div className="glass-panel p-1 rounded-2xl flex gap-1 shadow-md">
        <button
          type="button"
          onClick={() => setMetric("minutes")}
          className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            metric === "minutes"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span>⏱️</span>
          <span>Watched Minutes</span>
        </button>

        <button
          type="button"
          onClick={() => setMetric("predictions")}
          className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            metric === "predictions"
              ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20 font-black"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span>🎯</span>
          <span>Prediction Points</span>
        </button>
      </div>

      {/* When Prediction Points is active: League Pills (Overall + Leagues) */}
      {metric === "predictions" && (
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth">
          <button
            type="button"
            onClick={() => setSelectedLeagueId("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedLeagueId === "all"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)] font-black"
                : "bg-white/[0.04] text-slate-400 hover:text-white border border-white/10 hover:border-emerald-500/30"
            }`}
          >
            All (All Leagues)
          </button>
          {leagues.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedLeagueId(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedLeagueId === c.id
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)] font-black"
                  : "bg-white/[0.04] text-slate-400 hover:text-white border border-white/10 hover:border-emerald-500/30"
              }`}
            >
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Leaderboard Table */}
      {board.isLoading && <LoadingState label="Loading leaderboard..." />}
      {!board.isLoading && (!board.data || board.data.entries.length === 0) && (
        <EmptyState title="Add friends to see a leaderboard" />
      )}

      {!board.isLoading && board.data && board.data.entries.length > 0 && (
        <div className="space-y-1.5">
          {board.data.entries.map((entry, i) => {
            const isMe = entry.userId === user?.id;
            const rank = i + 1;
            const rankBadge = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;

            return (
              <Link
                key={entry.userId}
                to={isMe ? "/profile" : `/users/${entry.userId}`}
                viewTransition
                className={`flex items-center justify-between rounded-2xl p-3.5 border transition-all ${
                  isMe
                    ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/5"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-emerald-500/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-sm font-black text-[var(--color-text-dim)]">
                    {rankBadge}
                  </span>
                  <div className="h-8 w-8 rounded-full bg-[var(--color-surface-2)] overflow-hidden flex items-center justify-center text-xs font-bold border border-white/10">
                    {entry.avatar ? (
                      <img src={entry.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      entry.username[0]?.toUpperCase()
                    )}
                  </div>
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{isMe ? "You" : entry.username}</span>
                    {isMe && (
                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500 text-black uppercase">
                        You
                      </span>
                    )}
                  </span>
                </div>

                <span className="text-sm font-black text-emerald-400 tabular-nums">
                  {metric === "minutes"
                    ? `${entry.value.toLocaleString()} min`
                    : `${entry.value} pts`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
