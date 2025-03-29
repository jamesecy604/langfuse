import React from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

export type DateRange = {
  from: Date;
  to: Date;
};

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange) => void;
  ranges?: {
    label: string;
    value: string;
    range: DateRange;
  }[];
}

export const DateRangePicker = ({
  value,
  onChange,
  ranges = [
    {
      label: "Last 7 days",
      value: "last-7-days",
      range: {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        to: new Date(),
      },
    },
    {
      label: "Last 30 days",
      value: "last-30-days",
      range: {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date(),
      },
    },
    {
      label: "Last 90 days",
      value: "last-90-days",
      range: {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        to: new Date(),
      },
    },
  ].filter((range) => range.value && range.value.trim() !== ""),
}: DateRangePickerProps) => {
  const selectedRange = ranges.find((r) => {
    if (!value) return false;
    return (
      r.range.from.getTime() === value.from.getTime() &&
      r.range.to.getTime() === value.to.getTime()
    );
  });

  return (
    <Select.Root
      value={selectedRange?.value}
      onValueChange={(value) => {
        const range = ranges.find((r) => r.value === value)?.range;
        if (range && onChange) {
          onChange(range);
        }
      }}
    >
      <Select.Trigger className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
        <Select.Value placeholder="Select date range" />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Content className="z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
        <Select.Viewport className="p-1">
          {ranges.map((range) => (
            <Select.Item
              key={range.value}
              value={range.value}
              className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            >
              <Select.ItemText>{range.label}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Viewport>
      </Select.Content>
    </Select.Root>
  );
};
