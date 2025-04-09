import z from "zod";
import { singleFilter } from "../../../interfaces/filters";
import { FilterCondition } from "../../../types";
import { isValidTableName } from "../../clickhouse/schemaUtils";
import { logger } from "../../logger";
import { UiColumnMappings } from "../../../tableDefinitions";
import {
  StringFilter,
  DateTimeFilter,
  StringOptionsFilter,
  FilterList,
  NumberFilter,
  ArrayOptionsFilter,
  BooleanFilter,
  NumberObjectFilter,
  StringObjectFilter,
  NullFilter,
} from "./clickhouse-filter";

export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryBuilderError";
  }
}

export const createFilterFromFilterState = (
  filter: FilterCondition[],
  columnMapping: UiColumnMappings,
) => {
  return filter.map((frontEndFilter) => {
    const column = matchAndVerifyTracesUiColumn(frontEndFilter, columnMapping);
    return createFilterForColumn(frontEndFilter, column);
  });
};

export const createLLMApiKeyUsageFilterFromFilterState = (
  filter: FilterCondition[],
  columnMapping: UiColumnMappings,
) => {
  return filter.map((frontEndFilter) => {
    const column = matchAndVerifyLLMApiKeyUsageColumn(
      frontEndFilter,
      columnMapping,
    );
    return createFilterForColumn(frontEndFilter, column);
  });
};

const createFilterForColumn = (
  frontEndFilter: FilterCondition,
  column: UiColumnMappings[0],
) => {
  switch (frontEndFilter.type) {
    case "string":
      return new StringFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "datetime":
      return new DateTimeFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "stringOptions":
      return new StringOptionsFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        values: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "number":
      return new NumberFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
        clickhouseTypeOverwrite: column.clickhouseTypeOverwrite,
      });
    case "arrayOptions":
      return new ArrayOptionsFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        values: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "boolean":
      return new BooleanFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        value: frontEndFilter.value,
        operator: frontEndFilter.operator,
        tablePrefix: column.queryPrefix,
      });
    case "numberObject":
      return new NumberObjectFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        key: frontEndFilter.key,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "stringObject":
      return new StringObjectFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        key: frontEndFilter.key,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "null":
      return new NullFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        tablePrefix: column.queryPrefix,
      });
    default:
      const exhaustiveCheck: never = frontEndFilter;
      logger.error(`Invalid filter type: ${JSON.stringify(exhaustiveCheck)}`);
      throw new QueryBuilderError(`Invalid filter type`);
  }
};

const matchAndVerifyTracesUiColumn = (
  filter: z.infer<typeof singleFilter>,
  uiTableDefinitions: UiColumnMappings,
) => {
  logger.debug(`Filter to match: ${JSON.stringify(filter)}`);
  const uiTable = uiTableDefinitions.find(
    (col) =>
      col.uiTableName === filter.column || col.uiTableId === filter.column,
  );

  if (!uiTable) {
    throw new QueryBuilderError(
      `Column ${filter.column} does not match a UI / CH table mapping.`,
    );
  }

  if (!isValidTableName(uiTable.clickhouseTableName)) {
    throw new QueryBuilderError(
      `Invalid clickhouse table name: ${uiTable.clickhouseTableName}`,
    );
  }

  return uiTable;
};

const matchAndVerifyLLMApiKeyUsageColumn = (
  filter: z.infer<typeof singleFilter>,
  uiTableDefinitions: UiColumnMappings,
) => {
  logger.debug(`LLM API Key Usage Filter to match: ${JSON.stringify(filter)}`);
  const uiTable = uiTableDefinitions.find(
    (col) =>
      col.uiTableName === filter.column || col.uiTableId === filter.column,
  );

  if (!uiTable) {
    throw new QueryBuilderError(
      `Column ${filter.column} does not match a LLM API Key Usage table mapping.`,
    );
  }

  if (!isValidTableName(uiTable.clickhouseTableName)) {
    throw new QueryBuilderError(
      `Invalid clickhouse table name: ${uiTable.clickhouseTableName}`,
    );
  }

  return uiTable;
};

// Rest of the file remains unchanged...
export function getProjectsDefaultFilter(opts: { tracesPrefix: string }): {
  tracesFilter: FilterList;
  scoresFilter: FilterList;
  observationsFilter: FilterList;
} {
  return {
    tracesFilter: new FilterList([]),
    scoresFilter: new FilterList([]),
    observationsFilter: new FilterList([]),
  };
}

export function getLLMApiKeyDefaultFilter(opts: { tracesPrefix: string }): {
  usageFilter: FilterList;
} {
  return {
    usageFilter: new FilterList([]),
  };
}

export function getProjectIdDefaultFilter(
  projectId: string,
  opts: { tracesPrefix: string },
): {
  tracesFilter: FilterList;
  scoresFilter: FilterList;
  observationsFilter: FilterList;
} {
  return {
    tracesFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "project_id",
        operator: "=",
        value: projectId,
        tablePrefix: opts.tracesPrefix,
      }),
    ]),
    scoresFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "scores",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
    ]),
    observationsFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "observations",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
    ]),
  };
}

export function getUserIdDefaultFilter(
  userId: string,
  opts: { tracesPrefix: string },
): {
  tracesFilter: FilterList;
  scoresFilter: FilterList;
  observationsFilter: FilterList;
} {
  return {
    tracesFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "user_id",
        operator: "=",
        value: userId,
        tablePrefix: opts.tracesPrefix,
      }),
    ]),
    scoresFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "scores",
        field: "user_id",
        operator: "=",
        value: userId,
      }),
    ]),
    observationsFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "observations",
        field: "user_id",
        operator: "=",
        value: userId,
      }),
    ]),
  };
}
