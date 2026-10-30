import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#080b10] text-[#f1f5f9]">
      <div className="w-full max-w-sm">
        <div className="text-3xl font-black tracking-tight mb-2 text-center text-white">
          Match<span className="text-emerald-400">log</span>
        </div>
        <p className="text-sm text-slate-400 text-center mb-8">
          Sign in to your account with your username.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 focus:border-emerald-400 outline-none text-sm text-white placeholder-slate-500 transition-colors"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter your password"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 focus:border-emerald-400 outline-none text-sm text-white placeholder-slate-500 transition-colors"
              autoComplete="current-password"
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
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-400 text-black font-extrabold text-sm hover:bg-emerald-300 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-6">
          Don't have an account?{" "}
          <Link to="/register" className="text-emerald-400 hover:text-emerald-300 font-bold">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
