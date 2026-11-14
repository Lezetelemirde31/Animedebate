import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-purple-300", className)} aria-hidden />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-slide-up">
      <div>
        {eyebrow && (
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function GlassCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass rounded-2xl", className)} {...rest}>
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon: Icon,
  accent = "purple",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  accent?: "purple" | "red" | "amber" | "sky" | "green";
  hint?: string;
}) {
  const accents = {
    purple: "from-purple-500/25 text-purple-200",
    red: "from-rose-500/25 text-rose-200",
    amber: "from-amber-500/25 text-amber-200",
    sky: "from-sky-500/25 text-sky-200",
    green: "from-emerald-500/25 text-emerald-200",
  } as const;
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div className={cn("pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br to-transparent blur-xl", accents[accent])} />
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">
        {Icon && <Icon className={cn("h-4 w-4", accents[accent].split(" ")[1])} />}
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-white md:text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="glass flex flex-col items-center justify-center rounded-3xl px-6 py-16 text-center animate-slide-up">
      <div className="mb-4 rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4 neon-border">
        <Icon className="h-8 w-8 text-purple-200" />
      </div>
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-zinc-400">{description}</p>}
      {action && (
        <Link href={action.href} className="btn btn-primary mt-6">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="glass mx-auto flex max-w-lg flex-col items-center rounded-3xl border-rose-500/30 px-6 py-14 text-center animate-slide-up">
      <div className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 neon-border-red">
        <AlertTriangle className="h-8 w-8 text-rose-200" />
      </div>
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      {description && <p className="mt-2 text-sm text-zinc-400">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
