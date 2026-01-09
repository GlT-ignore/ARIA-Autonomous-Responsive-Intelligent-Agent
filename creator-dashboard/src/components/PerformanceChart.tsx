import React from 'react';

export const PerformanceChart: React.FC = () => {
  const data = [
    { day: 'Mon', value: 65 },
    { day: 'Tue', value: 78 },
    { day: 'Wed', value: 72 },
    { day: 'Thu', value: 85 },
    { day: 'Fri', value: 90 },
    { day: 'Sat', value: 82 },
    { day: 'Sun', value: 95 },
  ];

  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-card rounded-xl border border-border-subtle shadow-elevation-1 p-md transition-all duration-base hover:shadow-elevation-2 hover:-translate-y-px">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-h2 text-text-primary font-semibold">Weekly Performance</h2>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-primary-soft text-primary text-caption font-medium">
            7 days
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-transparent text-text-tertiary text-caption font-medium hover:bg-neutral-chip transition-colors duration-fast">
            30 days
          </button>
        </div>
      </div>
      
      <div className="flex items-end justify-between gap-2 h-32">
        {data.map((item) => {
          const height = (item.value / maxValue) * 100;
          return (
            <div key={item.day} className="flex flex-col items-center flex-1 gap-2">
              <div className="w-full flex items-end justify-center" style={{ height: '128px' }}>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary-hover transition-all duration-base hover:opacity-80 cursor-pointer relative group"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-fast bg-text-primary text-text-on-primary text-caption px-2 py-1 rounded-md whitespace-nowrap">
                    {item.value}K views
                  </div>
                </div>
              </div>
              <span className="text-caption text-text-tertiary">{item.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

