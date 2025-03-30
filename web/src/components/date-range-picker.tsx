import React, { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, Calendar, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar as CalendarComp } from "./ui/calendar";
import { TimePicker, type TimePickerProps } from "./ui/time-picker";

export type DateRange = {
  from: Date;
  to: Date;
};

interface DateRangePickerProps {
  value?: DateRange | null;
  onChange?: (value: DateRange | null) => void;
  ranges?: {
    label: string;
    value: string;
    range: DateRange;
  }[];
  presets?: (
    | {
        label: string;
        value: string;
      }
    | {
        label: string;
        value: string;
        getDateRange: () => DateRange;
      }
  )[];
  showTime?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  ranges,
  presets,
  showTime = false,
}: DateRangePickerProps) {
  const defaultRanges = [
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
  ].filter((range) => range.value && range.value.trim() !== "");

  const effectiveRanges =
    ranges ??
    presets?.map((preset) => {
      if ("getDateRange" in preset) {
        return {
          label: preset.label,
          value: preset.value,
          range: preset.getDateRange(),
        };
      }
      return {
        label: preset.label,
        value: preset.value,
        range: {
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          to: new Date(),
        },
      };
    }) ??
    defaultRanges;
  const [openCustomDialog, setOpenCustomDialog] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });
  const [selectedValue, setSelectedValue] = useState<string | null>(
    value
      ? (effectiveRanges.find(
          (r) =>
            r.range.from.getTime() === value.from.getTime() &&
            r.range.to.getTime() === value.to.getTime(),
        )?.value ?? "custom")
      : null,
  );

  const selectedRange = effectiveRanges.find((r) => r.value === selectedValue);
  const isCustomRange = selectedValue === "custom";

  return (
    <>
      <Select.Root
        value={selectedValue || undefined}
        onValueChange={(value) => {
          if (value === "custom") {
            setCustomRange({
              from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              to: new Date(),
            });
            setOpenCustomDialog(true);
            return;
          }
          if (value === "none") {
            if (onChange) onChange(null);
            return;
          }
          const range = effectiveRanges.find((r) => r.value === value)?.range;
          if (range && onChange) {
            onChange(range);
          }
        }}
      >
        <Select.Trigger className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <Select.Value
            placeholder={
              !value
                ? "None"
                : isCustomRange
                  ? `${value.from.toLocaleDateString()} - ${value.to.toLocaleDateString()}`
                  : selectedRange?.label || "Select date range"
            }
          />
          <Select.Icon>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Content className="z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <Select.Viewport className="p-1">
            {effectiveRanges.map((range) => (
              <Select.Item
                key={range.value}
                value={range.value}
                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <Select.ItemText>{range.label}</Select.ItemText>
              </Select.Item>
            ))}
            <Select.Item
              value="custom"
              className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            >
              <Select.ItemText>Custom Range</Select.ItemText>
            </Select.Item>
            <Select.Item
              value="none"
              className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            >
              <Select.ItemText>None</Select.ItemText>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Root>

      <Dialog open={openCustomDialog} onOpenChange={setOpenCustomDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Custom Date Range</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-medium">From</h4>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <Calendar className="mr-2 h-4 w-4" />
                      {customRange.from.toLocaleDateString()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp
                      mode="single"
                      selected={customRange.from}
                      onSelect={(date) => {
                        if (date) {
                          const newFrom = new Date(date);
                          if (showTime) {
                            newFrom.setHours(customRange.from.getHours());
                            newFrom.setMinutes(customRange.from.getMinutes());
                          }
                          setCustomRange({ ...customRange, from: newFrom });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {showTime && (
                  <TimePicker
                    date={customRange.from}
                    setDate={(date) => {
                      if (date) {
                        setCustomRange({ ...customRange, from: date });
                      }
                    }}
                  />
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">To</h4>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <Calendar className="mr-2 h-4 w-4" />
                      {customRange.to.toLocaleDateString()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp
                      mode="single"
                      selected={customRange.to}
                      onSelect={(date) => {
                        if (date) {
                          const newTo = new Date(date);
                          if (showTime) {
                            newTo.setHours(customRange.to.getHours());
                            newTo.setMinutes(customRange.to.getMinutes());
                          }
                          setCustomRange({ ...customRange, to: newTo });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {showTime && (
                  <TimePicker
                    date={customRange.to}
                    setDate={(date) => {
                      if (date) {
                        setCustomRange({ ...customRange, to: date });
                      }
                    }}
                  />
                )}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                if (onChange) {
                  // Convert to UTC dates before passing to onChange
                  const utcRange = {
                    from: new Date(customRange.from.toISOString()),
                    to: new Date(customRange.to.toISOString()),
                  };
                  onChange(utcRange);
                }
                setOpenCustomDialog(false);
              }}
            >
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
