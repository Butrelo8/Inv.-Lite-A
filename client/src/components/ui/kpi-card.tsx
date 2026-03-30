import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  /** Theme-aware accent (e.g. hsl(var(--chart-3))) */
  color: string;
}

export function KpiCard({ label, value, sub, color }: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/50 p-5 shadow-sm">
      <div
        className="absolute right-0 top-0 h-16 w-16 rounded-bl-full opacity-15"
        style={{ background: color }}
        aria-hidden
      />
      <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </Card>
  );
}
