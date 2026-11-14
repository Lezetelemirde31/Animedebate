/* eslint-disable @next/next/no-img-element */
import { avatarGradient } from "@/lib/avatars";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  username,
  style,
  imageUrl,
  size = 40,
  className,
  ring,
}: {
  username: string;
  style: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
  ring?: "purple" | "red" | "none";
}) {
  const ringClass =
    ring === "red"
      ? "ring-2 ring-rose-500/80 shadow-[0_0_20px_-2px_rgba(244,63,94,0.7)]"
      : ring === "purple"
        ? "ring-2 ring-purple-500/80 shadow-[0_0_20px_-2px_rgba(168,85,247,0.7)]"
        : "ring-1 ring-white/15";
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full", ringClass, className)}
      style={{ width: size, height: size, background: avatarGradient(style) }}
      aria-label={`${username}'s avatar`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-display font-bold text-white"
          style={{ fontSize: Math.max(11, size * 0.38) }}
        >
          {initials(username) || "?"}
        </span>
      )}
    </div>
  );
}
