import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-inner">
    <p className="text-sm uppercase tracking-wide text-slate-400">{label}</p>
    <p className="mt-2 text-3xl font-semibold text-slate-100">{value.toLocaleString()}</p>
  </div>
);

export const StatsOverview = () => {
  const parsed = useAppStore((state) => state.parsed);

  const stats = useMemo(() => parsed?.stats, [parsed]);

  if (!stats) return null;

  return (
    <section className="grid gap-4 rounded-3xl border border-slate-700/60 bg-slate-900/60 p-6 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="助手数量" value={stats.agentCount} />
      <StatCard label="话题数量" value={stats.topicCount} />
      <StatCard label="消息数量" value={stats.messageCount} />
    </section>
  );
};
