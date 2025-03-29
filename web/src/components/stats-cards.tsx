import React from "react";

interface StatItem {
  name: string;
  value: string | number;
  change?: string;
  changeType?: "increase" | "decrease";
}

interface StatsCardsProps {
  stats: StatItem[];
}

export default function StatsCards({ stats = [] }: StatsCardsProps) {
  return (
    <div>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-lg bg-background px-4 py-5 shadow sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-muted-foreground">
              {item.name}
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
