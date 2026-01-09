import { PanelHeader } from './components/PanelHeader';
import { StatsCard } from './components/StatsCard';
import { PerformanceChart } from './components/PerformanceChart';
import { RecentContent } from './components/RecentContent';
import { ActionCard } from './components/ActionCard';

function App() {
  return (
    <div className="min-h-screen bg-canvas py-md">
      <div className="max-w-[360px] mx-auto px-[14px]">
        <PanelHeader />
        
        <div className="flex flex-col gap-sm">
          <StatsCard />
          <PerformanceChart />
          <RecentContent />
          <ActionCard />
        </div>
      </div>
    </div>
  );
}

export default App;
