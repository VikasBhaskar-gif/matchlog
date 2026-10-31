import { useRef, useState, useEffect } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingState } from "./States";
import { ErrorBoundary } from "./ErrorBoundary";
import { SupportedTeamModal } from "./SupportedTeamModal";
import { useScrollRestoration } from "../lib/useScrollRestoration";

const NAV_ITEMS = [
  { to: "/matches", label: "Matches", icon: "⚽" },
  { to: "/leagues", label: "Leagues", icon: "🏆" },
  { to: "/teams", label: "Teams", icon: "👕" },
  { to: "/players", label: "Players", icon: "👤" },
  { to: "/leaderboard", label: "Leaderboard", icon: "🏅" },
  { to: "/friends", label: "Friends", icon: "🧑‍🤝‍🧑" },
  { to: "/stats", label: "My Stats", icon: "📊" },
];

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useScrollRestoration(mainRef);

  const navScrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const checkScroll = () => {
    if (!navScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = navScrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll > 0) {
      setScrollProgress(Math.min(1, Math.max(0, scrollLeft / maxScroll)));
    } else {
      setScrollProgress(0);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, []);

  useEffect(() => {
    if (!navScrollRef.current) return;
    checkScroll();
    const activeEl = navScrollRef.current.querySelector<HTMLElement>(".active-nav-item");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [location.pathname]);

  if (loading) return <LoadingState label="Loading Matchlog..." />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen sm:h-screen sm:overflow-hidden flex flex-col sm:flex-row bg-[#080b10] text-[#f1f5f9]">
      {/* If the user has not selected their supported club yet, prompt immediately */}
      {!user.onboardingCompleted && (
        <SupportedTeamModal isOpen={true} isOnboarding={true} />
      )}

      {/* Mobile Top Header (Mobile only: sm:hidden) */}
      <header className="sm:hidden sticky top-0 z-40 bg-gradient-to-r from-[#07140f]/95 via-[#06100c]/95 to-[#040a08]/95 backdrop-blur-xl border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-[0_4px_20px_rgba(16,185,129,0.1)]">
        <NavLink to="/matches" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-black border border-emerald-300/40 flex items-center justify-center text-sm shadow-[0_0_14px_rgba(16,185,129,0.4)] group-hover:scale-105 transition-transform">
            ⚽
          </div>
          <span className="text-base font-black tracking-tight text-white">
            Match<span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">log</span>
          </span>
        </NavLink>

        <NavLink
          to="/profile"
          viewTransition
          className={({ isActive }) =>
            `flex items-center gap-2 py-1 px-3 rounded-full border transition-all ${
              isActive
                ? "bg-emerald-500/20 border-emerald-500/60 shadow-[0_0_14px_rgba(16,185,129,0.3)] text-emerald-300 font-bold"
                : "bg-emerald-950/30 border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-900/40 text-slate-200"
            }`
          }
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-[11px] text-black shrink-0 overflow-hidden ring-1 ring-emerald-400/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              user.username[0]?.toUpperCase()
            )}
          </div>
          <span className="text-xs font-bold max-w-[110px] truncate text-slate-200">
            {user.username}
          </span>
        </NavLink>
      </header>

      {/* Fixed viewport-height desktop sidebar */}
      <nav className="hidden sm:flex sm:flex-col w-64 shrink-0 border-r border-emerald-500/20 h-full p-4 bg-gradient-to-b from-[#07140f]/95 via-[#06100c]/95 to-[#040a08]/95 backdrop-blur-2xl shadow-[4px_0_30px_rgba(16,185,129,0.07)] relative">
        {/* Ambient top green glow */}
        <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-emerald-500/10 via-emerald-500/[0.02] to-transparent pointer-events-none" />

        {/* Top brand logo */}
        <div className="shrink-0 flex items-center justify-between mb-6 px-2 relative z-10">
          <NavLink to="/matches" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 border border-emerald-300/40 flex items-center justify-center text-lg shadow-[0_0_18px_rgba(16,185,129,0.45)] group-hover:scale-105 group-hover:shadow-[0_0_24px_rgba(16,185,129,0.6)] transition-all">
              ⚽
            </div>
            <span className="text-xl font-black tracking-tight text-white">
              Match<span className="text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]">log</span>
            </span>
          </NavLink>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-black text-emerald-300 tracking-wider shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            LIVE
          </span>
        </div>

        {/* Scrollable navigation link list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1 -mr-1 relative z-10 no-scrollbar">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>

        {/* Pinned user profile & data source footer */}
        <div className="shrink-0 pt-3 mt-auto border-t border-emerald-500/20 space-y-2 relative z-10">
          <NavLink
            to="/profile"
            viewTransition
            className={({ isActive }) =>
              `group flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-200 border ${
                isActive
                  ? "bg-gradient-to-r from-emerald-950/60 via-[#0a1813] to-emerald-950/40 border-emerald-500/50 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                  : "bg-emerald-950/25 border-emerald-500/20 hover:bg-emerald-900/35 hover:border-emerald-500/40 hover:shadow-[0_0_16px_rgba(16,185,129,0.15)] text-slate-300"
              }`
            }
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-xs text-black shadow-md shrink-0 overflow-hidden ring-2 ring-emerald-400/40 group-hover:scale-105 transition-transform">
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-xs truncate text-white leading-tight group-hover:text-emerald-300 transition-colors">
                {user.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {user.supportedTeam ? (
                  <span className="text-[10px] text-emerald-400 font-bold truncate flex items-center gap-1 shrink-0">
                    {user.supportedTeam.logoUrl && (
                      <img src={user.supportedTeam.logoUrl} alt="" className="w-3 h-3 object-contain inline" />
                    )}
                    {user.supportedTeam.shortName || user.supportedTeam.name}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 truncate">Neutral fan</span>
                )}
              </div>
            </div>
          </NavLink>

          <p className="px-2 text-[10px] text-emerald-500/60 leading-snug">
            Football data via{" "}
            <a
              href="https://github.com/openfootball/football.json"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400/80 underline hover:text-emerald-300 transition-colors"
            >
              OpenFootball
            </a>{" "}
            &{" "}
            <a
              href="https://www.football-data.org"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400/80 underline hover:text-emerald-300 transition-colors"
            >
              football-data.org
            </a>
          </p>
        </div>
      </nav>

      {/* Independently scrollable main content with smooth page transitions */}
      <main ref={mainRef} className="flex-1 sm:h-full sm:overflow-y-auto sm:overflow-x-hidden pb-24 sm:pb-0">
        <div key={location.pathname} className="animate-page-in min-h-full">
          <ErrorBoundary resetKeys={[location.pathname]}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Floating frosted-glass mobile bottom dock (horizontally scrollable for all items) */}
      <nav className="sm:hidden fixed bottom-3 left-2 right-2 z-50 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-[#081510]/95 via-[#06100c]/95 to-[#040a08]/95 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.9),0_0_25px_rgba(16,185,129,0.2)] p-1.5 flex flex-col items-center">
        {/* Horizontally scrollable items list */}
        <div
          ref={navScrollRef}
          onScroll={checkScroll}
          className="w-full flex items-center overflow-x-auto no-scrollbar scroll-smooth touch-pan-x px-1"
        >
          <div className="flex items-center gap-1.5 min-w-max mx-auto px-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                viewTransition
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-150 shrink-0 relative ${
                    isActive
                      ? "text-emerald-300 scale-105 bg-emerald-500/20 border border-emerald-400/40 shadow-[0_0_14px_rgba(16,185,129,0.35)] active-nav-item font-extrabold"
                      : "text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/[0.08] active:scale-95 border border-transparent font-semibold"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="text-base select-none leading-none drop-shadow-sm">{item.icon}</span>
                    <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">{item.label}</span>
                    {isActive && (
                      <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Scroll indicator bar at bottom so scrollers know they can scroll to see more */}
        <div className="w-full flex items-center justify-center pt-1.5 pb-0.5">
          <div className="w-20 h-1 bg-emerald-950/80 border border-emerald-500/25 rounded-full overflow-hidden relative">
            <div
              className="h-full w-8 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.7)] transition-transform duration-75"
              style={{
                transform: `translateX(${scrollProgress * (80 - 32)}px)`,
              }}
            />
          </div>
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      viewTransition
      className={({ isActive }) =>
        `group flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 relative overflow-hidden ${
          isActive
            ? "bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent border border-emerald-500/40 text-white shadow-[0_0_20px_rgba(16,185,129,0.18),inset_0_1px_1px_rgba(255,255,255,0.1)]"
            : "text-slate-300 hover:text-white hover:bg-emerald-500/[0.08] hover:border-emerald-500/25 border border-transparent"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active left indicator pill */}
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b from-emerald-400 to-teal-300 shadow-[0_0_10px_#10b981]" />
          )}

          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-tr from-emerald-500/30 to-teal-500/20 border border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.3)] text-emerald-300 scale-105"
                  : "bg-white/[0.03] border border-white/[0.06] group-hover:bg-emerald-500/15 group-hover:border-emerald-500/30 group-hover:scale-105 text-slate-400 group-hover:text-emerald-300"
              }`}
            >
              <span className="select-none leading-none">{icon}</span>
            </div>
            <span
              className={`transition-colors ${
                isActive ? "font-black text-white text-sm" : "font-bold text-slate-300 group-hover:text-emerald-200"
              }`}
            >
              {label}
            </span>
          </div>

          {isActive ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" />
          ) : (
            <span className="w-1 h-1 rounded-full bg-transparent group-hover:bg-emerald-500/40 transition-colors" />
          )}
        </>
      )}
    </NavLink>
  );
}
