import { useState } from "react";
import { useMatchReviews } from "../hooks/queries";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function MatchReviewsSection({ matchId }: { matchId: string }) {
  const { data, isLoading, refetch } = useMatchReviews(matchId);
  const { user } = useAuth();

  const [content, setContent] = useState("");
  const [matchQualityRating, setMatchQualityRating] = useState<number | null>(null);
  const [refereeRating, setRefereeRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const reviews = data?.reviews ?? [];
  const stats = data?.stats;
  const myReview = reviews.find((r) => r.isMyReview);

  /** At least one field must be filled for submission */
  const canSubmit =
    content.trim().length > 0 || matchQualityRating !== null || refereeRating !== null;

  function startEdit() {
    if (myReview) {
      setContent(myReview.content ?? "");
      setMatchQualityRating(myReview.matchQualityRating ?? null);
      setRefereeRating(myReview.refereeRating ?? null);
      setIsEditing(true);
    }
  }

  function cancelEdit() {
    setIsEditing(false);
    setContent("");
    setMatchQualityRating(null);
    setRefereeRating(null);
    setError(null);
  }

  const wordCount = content.trim().length === 0 ? 0 : content.trim().split(/\s+/).filter(Boolean).length;

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    if (wordCount > 300) {
      setError("Review must be 300 words or less.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/matches/${matchId}/reviews`, {
        ...(content.trim().length > 0 ? { content: content.trim() } : {}),
        ...(matchQualityRating !== null ? { matchQualityRating } : {}),
        ...(refereeRating !== null ? { refereeRating } : {}),
      });
      setContent("");
      setMatchQualityRating(null);
      setRefereeRating(null);
      setIsEditing(false);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save review.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteReview() {
    if (!confirm("Are you sure you want to delete your review?")) return;
    try {
      await api.delete(`/matches/${matchId}/reviews`);
      refetch();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggleLike(reviewId: string) {
    if (!user) return;
    try {
      await api.post(`/reviews/${reviewId}/like`);
      refetch();
    } catch (err) {
      console.error("Like error:", err);
    }
  }

  const StarPicker = ({
    label,
    value,
    onChange,
    activeClass,
  }: {
    label: string;
    value: number | null;
    onChange: (v: number | null) => void;
    activeClass: string;
  }) => (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-xs text-[var(--color-text-dim)]">{label}</label>
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-[var(--color-text-dim)] hover:text-[var(--color-danger)] underline"
          >
            Clear
          </button>
        )}
        {value !== null && (
          <span className={`text-xs font-bold ${activeClass}`}>{value}★</span>
        )}
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            onClick={() => onChange(value === star ? null : star)}
            className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${
              value !== null && value >= star
                ? activeClass.includes("amber")
                  ? "bg-amber-400 text-black"
                  : "bg-[var(--color-primary)] text-black"
                : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:border hover:border-[var(--color-border)]"
            }`}
          >
            {star}★
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Ratings Summary Header */}
      {stats && stats.totalReviews > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex flex-wrap items-center justify-around gap-4 text-center">
          <div>
            <p className="text-2xl font-black text-[var(--color-primary)]">
              {stats.averageMatchQuality !== null
                ? `${stats.averageMatchQuality} / 5`
                : "—"}
            </p>
            <p className="text-xs text-[var(--color-text-dim)] font-medium mt-0.5">
              ⭐ Match Quality
            </p>
            {stats.qualityRatingCount > 0 && (
              <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
                {stats.qualityRatingCount} {stats.qualityRatingCount === 1 ? "rating" : "ratings"}
              </p>
            )}
          </div>
          <div className="h-8 w-[1px] bg-[var(--color-border)] hidden sm:block" />
          <div>
            <p className="text-2xl font-black text-amber-400">
              {stats.averageRefereeRating !== null
                ? `${stats.averageRefereeRating} / 5`
                : "—"}
            </p>
            <p className="text-xs text-[var(--color-text-dim)] font-medium mt-0.5">
              🟨 Referee Performance
            </p>
            {stats.refereeRatingCount > 0 && (
              <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
                {stats.refereeRatingCount} {stats.refereeRatingCount === 1 ? "rating" : "ratings"}
              </p>
            )}
          </div>
          <div className="h-8 w-[1px] bg-[var(--color-border)] hidden sm:block" />
          <div>
            <p className="text-2xl font-black text-[var(--color-text)]">{stats.totalReviews}</p>
            <p className="text-xs text-[var(--color-text-dim)] font-medium mt-0.5">💬 Total Reviews</p>
          </div>
        </div>
      )}

      {/* Review Form */}
      {user ? (
        myReview && !isEditing ? (
          <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider">
                Your Review
              </span>
              <div className="flex gap-2">
                <button
                  onClick={startEdit}
                  className="text-xs font-semibold text-[var(--color-text-dim)] hover:text-white"
                >
                  Edit
                </button>
                <button
                  onClick={handleDeleteReview}
                  className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
            {myReview.content && (
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{myReview.content}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-text-dim)]">
              {myReview.matchQualityRating && (
                <span>Match Quality: {myReview.matchQualityRating}★</span>
              )}
              {myReview.refereeRating && <span>Referee: {myReview.refereeRating}★</span>}
              <span>
                ❤️ {myReview.likesCount} {myReview.likesCount === 1 ? "like" : "likes"}
              </span>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitReview}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
                {isEditing ? "Edit Your Review" : "Write a Match Review"}
              </label>
              <span
                className={`text-xs ${wordCount > 300 ? "text-[var(--color-danger)] font-bold" : "text-[var(--color-text-dim)]"}`}
              >
                {wordCount} / 300 words
              </span>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share your thoughts on the tactical display... (up to 300 words — or just rate with stars)"
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-y min-h-[90px]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StarPicker
                label="Match Quality"
                value={matchQualityRating}
                onChange={setMatchQualityRating}
                activeClass="text-[var(--color-primary)]"
              />
              <StarPicker
                label="Referee Rating"
                value={refereeRating}
                onChange={setRefereeRating}
                activeClass="text-amber-400"
              />
            </div>

            {!canSubmit && (
              <p className="text-[11px] text-[var(--color-text-dim)] italic">
                Add text, a match rating, or a referee rating to submit.
              </p>
            )}

            {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              {isEditing && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-dim)] hover:text-white"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-black hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? "Posting..." : isEditing ? "Save Review" : "Post Review"}
              </button>
            </div>
          </form>
        )
      ) : (
        <p className="text-xs text-[var(--color-text-dim)] p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center">
          Sign in to leave a review and rate this match.
        </p>
      )}

      {/* Reviews List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
          Community Reviews ({reviews.length}) · Sorted by Most Liked
        </h3>

        {isLoading && <p className="text-xs text-[var(--color-text-dim)]">Loading reviews...</p>}

        {!isLoading && reviews.length === 0 && (
          <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">
            No reviews yet. Be the first to share your thoughts!
          </p>
        )}

        {reviews.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border p-4 transition-all ${
              r.isMyReview
                ? "border-[var(--color-primary)]/40 bg-[var(--color-surface)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center font-bold text-xs text-[var(--color-primary)] border border-[var(--color-border)]">
                  {r.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-[var(--color-text)]">{r.username}</span>
                    {r.isMyReview && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--color-primary)] text-black">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-dim)] mt-0.5">
                    {r.matchQualityRating && <span>Match: {r.matchQualityRating}★</span>}
                    {r.refereeRating && <span>Ref: {r.refereeRating}★</span>}
                  </div>
                </div>
              </div>

              {/* Like Button */}
              <button
                onClick={() => handleToggleLike(r.id)}
                disabled={!user}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  r.hasLiked
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                    : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-white"
                }`}
                title={user ? (r.hasLiked ? "Unlike" : "Like") : "Sign in to like"}
              >
                <span>{r.hasLiked ? "❤️" : "🤍"}</span>
                <span>{r.likesCount}</span>
              </button>
            </div>

            {r.content && (
              <p className="text-xs text-[var(--color-text)] whitespace-pre-wrap leading-relaxed mt-2">
                {r.content}
              </p>
            )}
            {!r.content && (r.matchQualityRating || r.refereeRating) && (
              <p className="text-[11px] text-[var(--color-text-dim)] italic mt-1">Rating only</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
