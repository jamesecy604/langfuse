import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  type TableDateRangeOptions,
  isValidTableDateRangeAggregationOption,
  type TableDateRangeAggregationOption,
  type TableDateRange,
  getDateFromOption,
} from "@/src/utils/date-range-utils";
import useSessionStorage from "@/src/components/useSessionStorage";

export interface UseTableDateRangeOutput {
  selectedOption: TableDateRangeOptions;
  dateRange: TableDateRange | undefined;
  setDateRangeAndOption: (
    option: TableDateRangeOptions,
    range?: TableDateRange,
  ) => void;
}

export function useTableDateRange(
  id: string,
  idType: "project" | "user" = "project",
): UseTableDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: withDefault(StringParam, "Select a date range"),
  });

  const defaultDateRange: TableDateRangeOptions = "24 hours";
  const validatedInitialRangeOption = isValidTableDateRangeAggregationOption(
    queryParams.dateRange,
  )
    ? (queryParams.dateRange as TableDateRangeAggregationOption)
    : defaultDateRange;

  const [selectedOption, setSelectedOption] =
    useSessionStorage<TableDateRangeOptions>(
      `tableDateRangeState-${idType}-${id}`,
      validatedInitialRangeOption,
    );

  const dateFromOption = getDateFromOption({
    filterSource: "TABLE",
    option: selectedOption,
  });

  const initialDateRange = !!dateFromOption
    ? { from: dateFromOption }
    : undefined;

  const [dateRange, setDateRange] = useState<TableDateRange | undefined>(
    initialDateRange,
  );
  const setDateRangeAndOption = (
    option: TableDateRangeOptions,
    range?: TableDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(range);
    setQueryParams({ dateRange: option });
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
