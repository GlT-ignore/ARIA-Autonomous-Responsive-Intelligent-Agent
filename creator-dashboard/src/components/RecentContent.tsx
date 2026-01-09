import React from 'react';

interface ContentItemProps {
  title: string;
  views: string;
  likes: string;
  date: string;
  thumbnail: string;
}

const ContentItem: React.FC<ContentItemProps> = ({ title, views, likes, date, thumbnail }) => (
  <div className="flex gap-3 p-sm rounded-lg hover:bg-neutral-chip transition-colors duration-fast cursor-pointer group">
    <div className="w-16 h-16 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-xl font-bold flex-shrink-0 overflow-hidden">
      {thumbnail}
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="text-body text-text-primary font-medium mb-1 truncate group-hover:text-primary transition-colors duration-fast">
        {title}
      </h3>
      <div className="flex items-center gap-3 text-caption text-text-tertiary">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {views}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {likes}
        </span>
        <span>• {date}</span>
      </div>
    </div>
  </div>
);

export const RecentContent: React.FC = () => {
  const content = [
    { title: 'How to Build Modern UIs with Tailwind', views: '125K', likes: '8.2K', date: '2 days ago', thumbnail: '🎨' },
    { title: 'React Performance Tips & Tricks', views: '98K', likes: '6.5K', date: '5 days ago', thumbnail: '⚡' },
    { title: 'Design System Deep Dive', views: '87K', likes: '5.9K', date: '1 week ago', thumbnail: '🎯' },
    { title: 'State Management Made Simple', views: '142K', likes: '9.8K', date: '2 weeks ago', thumbnail: '📊' },
  ];

  return (
    <div className="bg-card rounded-xl border border-border-subtle shadow-elevation-1 p-md transition-all duration-base hover:shadow-elevation-2 hover:-translate-y-px">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-h2 text-text-primary font-semibold">Recent Content</h2>
        <button className="text-caption text-primary font-medium hover:text-primary-hover transition-colors duration-fast">
          View all
        </button>
      </div>
      
      <div className="flex flex-col gap-1">
        {content.map((item, index) => (
          <React.Fragment key={item.title}>
            <ContentItem {...item} />
            {index < content.length - 1 && (
              <div className="h-px bg-border-divider my-1" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

