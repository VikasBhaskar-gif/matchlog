import { UserStatsView } from "../components/UserStatsView";

export function StatsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <UserStatsView showHeader={true} />
    </div>
  );
}
