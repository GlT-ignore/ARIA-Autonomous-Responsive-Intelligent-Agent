import React from 'react';

export const ActionCard: React.FC = () => {
  return (
    <div className="bg-card rounded-xl border border-border-subtle shadow-elevation-1 p-md transition-all duration-base hover:shadow-elevation-2 hover:-translate-y-px">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-xl bg-primary-soft flex items-center justify-center">
          <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div>
          <h3 className="text-h2 text-text-primary font-semibold mb-1">Create New Content</h3>
          <p className="text-body text-text-secondary">
            Start creating your next viral video or post
          </p>
        </div>
        <button className="w-full h-[46px] rounded-xl bg-gradient-cta text-text-on-primary font-semibold text-title shadow-elevation-1 hover:shadow-elevation-2 hover:brightness-105 active:brightness-95 transition-all duration-base">
          Get Started
        </button>
      </div>
    </div>
  );
};

