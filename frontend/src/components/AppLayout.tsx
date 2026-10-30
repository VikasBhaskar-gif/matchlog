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
      <header className="sm:hidden sticky top-0 z-40 bg-[#080b10]/95 backdrop-blur-md border-b border-white/[0.08] px-4 py-2.5 flex items-center justify-between shrink-0 shadow-sm">
        <NavLink to="/matches" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-400/20 border border-emerald-500/40 flex items-center justify-center text-sm shadow-[0_0_12px_rgba(16,185,129,0.25)]">
            ⚽
          </div>
          <span className="text-base font-black tracking-tight text-white">
            Match<span className="text-emerald-400">log</span>
          </span>
        </NavLink>

        <NavLink
          to="/profile"
          viewTransition
          className={({ isActive }) =>
            `flex items-center gap-2 py-1 px-2.5 rounded-full border transition-all ${
              isActive
                ? "bg-emerald-500/15 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] text-emerald-400"
                : "bg-white/[0.04] border-white/10 hover:border-white/20 text-slate-200"
            }`
          }
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-[11px] text-black shrink-0 overflow-hidden ring-1 ring-white/20">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              user.username[0]?.toUpperCase()
            )}
          </div>
          <span className="text-xs font-bold max-w-[110px] truncate">
            {user.username}
          </span>
        </NavLink>
      </header>

      {/* Fixed viewport-height desktop sidebar */}
      <nav className="hidden sm:flex sm:flex-col w-60 shrink-0 border-r border-white/[0.08] h-full p-4 bg-[#0c1017]/80 backdrop-blur-xl">
        {/* Top brand logo */}
        <div className="shrink-0 flex items-center justify-between mb-5 px-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-400/20 border border-emerald-500/40 flex items-center justify-center text-lg shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              ⚽
            </div>
            <span className="text-xl font-black tracking-tight text-white">
              Match<span className="text-emerald-400">log</span>
            </span>
          </div>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-extrabold text-emerald-400 tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        </div>

        {/* Scrollable navigation link list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 -mr-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>

        {/* Pinned user profile & data source footer */}
        <div className="shrink-0 pt-3 mt-auto border-t border-white/[0.08] space-y-2">
          <NavLink
            to="/profile"
            viewTransition
            className={({ isActive }) =>
              `group flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-200 border ${
                isActive
                  ? "bg-white/[0.08] border-emerald-500/40 text-white shadow-sm"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] text-slate-300"
              }`
            }
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-xs text-black shadow-md shrink-0 overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-xs truncate text-white leading-tight group-hover:text-emerald-400 transition-colors">
                {user.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {user.supportedTeam ? (
                  <span className="text-[10px] text-emerald-400 font-semibold truncate flex items-center gap-1 shrink-0">
                    {user.supportedTeam.logoUrl && (
                      <img src={user.supportedTeam.logoUrl} alt="" className="w-2.5 h-2.5 object-contain inline" />
                    )}
                    {user.supportedTeam.shortName || user.supportedTeam.name}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 truncate">Neutral fan</span>
                )}
              </div>
            </div>
          </NavLink>

          <p className="px-2 text-[10px] text-slate-500 leading-snug">
            Football data via{" "}
            <a
              href="https://github.com/openfootball/football.json"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 underline hover:text-white transition-colors"
            >
              OpenFootball
            </a>{" "}
            &{" "}
            <a
              href="https://www.football-data.org"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 underline hover:text-white transition-colors"
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
      <nav className="sm:hidden fixed bottom-3 left-2 right-2 z-50 glass-panel rounded-2xl border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.85)] p-1.5 flex flex-col items-center">
        {/* Horizontally scrollable items list */}
        <div
          ref={navScrollRef}
          onScroll={checkScroll}
          className="w-full flex items-center overflow-x-auto no-scrollbar scroll-smooth touch-pan-x px-1"
        >
          <div className="flex items-center gap-1 min-w-max mx-auto px-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                viewTransition
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-1 px-3.5 rounded-xl transition-all duration-150 shrink-0 relative ${
                    isActive
                      ? "text-emerald-400 scale-105 bg-white/[0.06] active-nav-item"
                      : "text-slate-400 hover:text-slate-200 active:scale-95"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="text-base select-none leading-none">{item.icon}</span>
                    <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">{item.label}</span>
                    {isActive && (
                      <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Scroll indicator bar at bottom so scrollers know they can scroll to see more */}
        <div className="w-full flex items-center justify-center pt-1 pb-0.5">
          <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden relative">
            <div
              className="h-full w-8 bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.6)] transition-transform duration-75"
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
        `group flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-150 relative ${
          isActive
            ? "bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
            : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className="flex items-center gap-3">
            <span className="text-base select-none group-hover:scale-110 transition-transform duration-150">
              {icon}
            </span>
            <span>{label}</span>
          </div>
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
          )}
        </>
      )}
    </NavLink>
  );
}
