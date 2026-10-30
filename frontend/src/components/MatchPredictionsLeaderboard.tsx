import { useMatchPredictions } from "../hooks/queries";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { LoadingState } from "./States";

export function MatchPredictionsLeaderboard({
  matchId,
  isFinished,
  isLive,
  homeTeamName,
  awayTeamName,
}: {
  matchId: string;
  isFinished: boolean;
  isLive: boolean;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const { user } = useAuth();
  const { data, isLoading } = useMatchPredictions(matchId);

  if (isLoading) return <LoadingState label="Loading predictions leaderboard..." />;

  const list = data?.predictions ?? [];

  return (
    <div className="space-y-4 pt-6 border-t border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span>🏆</span>
            <span>Predictions Leaderboard</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
              {list.length}
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFinished
              ? "Final points awarded for this match"
              : isLive
              ? "Live predicted scores & current points"
              : "Predictions submitted by community fans"}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-slate-500">
          No predictions submitted for this match yet. Predict above to take the lead!
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#111927]/60 to-[#0c121e]/60 backdrop-blur-md">
          <div className="divide-y divide-white/5">
            {list.map((item, idx) => {
              const isMe = item.userId === user?.id;
              const rank = idx + 1;
              const rankBadge =
                rank === 1
                  ? "🥇"
                  : rank === 2
                  ? "🥈"
                  : rank === 3
                  ? "🥉"
                  : `#${rank}`;

              const outcomeText =
                item.predictedOutcome === "HOME"
                  ? `${homeTeamName} Win`
                  : item.predictedOutcome === "AWAY"
                  ? `${awayTeamName} Win`
                  : "Draw";

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3.5 transition-colors ${
                    isMe
                      ? "bg-emerald-500/10 border-l-4 border-l-emerald-400"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 text-center font-black text-xs text-slate-400 shrink-0">
                      {rankBadge}
                    </span>
                    <Link
                      to={isMe ? "/profile" : `/users/${item.userId}`}
                      viewTransition
                      className="flex items-center gap-2.5 group min-w-0"
                    >
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-xs font-black text-black shrink-0 overflow-hidden border border-white/10">
                        {item.user.avatar ? (
                          <img
                            src={item.user.avatar}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          item.user.username[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate flex items-center gap-1.5">
                          <span>{item.user.username}</span>
                          {isMe && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500 text-black uppercase">
                              You
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {outcomeText}
                        </p>
                      </div>
                    </Link>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 font-black text-xs text-white tabular-nums tracking-wider shadow-inner">
                        {item.predictedHomeScore} : {item.predictedAwayScore}
                      </div>
                    </div>

                    <div className="w-20 text-right">
                      {isFinished || isLive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-extrabold text-xs tabular-nums shadow-sm">
                          <span>{item.pointsAwarded ?? 0}</span>
                          <span className="text-[10px] font-medium opacity-80">pts</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-medium italic">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
