import { useState } from "react";
import { playerInitials } from "../lib/format";

interface PlayerAvatarProps {
  name: string;
  photoUrl?: string | null;
  className?: string;
  roundedClassName?: string;
  textClassName?: string;
}

export function PlayerAvatar({
  name,
  photoUrl,
  className = "w-11 h-11",
  roundedClassName = "rounded-full",
  textClassName = "text-xs font-bold text-slate-300",
}: PlayerAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const initials = playerInitials(name);

  return (
    <div
      className={`${className} ${roundedClassName} bg-white/[0.04] border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner relative`}
    >
      {photoUrl && !hasError ? (
        <img
          src={photoUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className={`${textClassName} tracking-wider select-none`}>
          {initials}
        </span>
      )}
    </div>
  );
}
