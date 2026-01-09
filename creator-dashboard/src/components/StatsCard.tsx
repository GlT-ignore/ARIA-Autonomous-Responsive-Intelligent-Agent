import React from 'react';

interface StatItemProps {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
}

const StatItem: React.FC<StatItemProps> = ({ label, value, change, isPositive }) => (
  <div className="flex flex-col gap-1">
    <span className="text-micro text-text-tertiary uppercase tracking-wide">{label}</span>
    <span className="text-h1 text-text-primary font-bold">{value}</span>
    <span className={`text-caption font-medium ${isPositive ? 'text-status-success' : 'text-status-danger'}`}>
      {isPositive ? '↑' : '↓'} {change}
    </span>
  </div>
);

export const StatsCard: React.FC = () => {
  const stats = [
    { label: 'Total Views', value: '1.2M', change: '+12.5%', isPositive: true },
    { label: 'Subscribers', value: '45.8K', change: '+8.3%', isPositive: true },
    { label: 'Revenue', value: '$8,450', change: '+15.2%', isPositive: true },
    { label: 'Engagement', value: '4.8%', change: '-0.3%', isPositive: false },
  ];

  return (
    <div className="bg-card rounded-xl border border-border-subtle shadow-elevation-1 p-md transition-all duration-base hover:shadow-elevation-2 hover:-translate-y-px">
      <h2 className="text-h2 text-text-primary font-semibold mb-md">Overview</h2>
      <div className="grid grid-cols-2 gap-md">
        {stats.map((stat) => (
          <StatItem key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
};

