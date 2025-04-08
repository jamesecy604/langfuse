import { type ColumnDefinition } from "@langfuse/shared";

export const projectsTableCols: ColumnDefinition[] = [
  {
    name: "Project ID",
    id: "projectId",
    type: "string",
    internal: 'p."projectId"',
  },
  {
    name: "Environment",
    id: "environment",
    type: "string",
    internal: 'p."environment"',
  },
  {
    name: "First Event",
    id: "firstEvent",
    type: "datetime",
    internal: 'p."firstEvent"',
  },
  {
    name: "Last Event",
    id: "lastEvent",
    type: "datetime",
    internal: 'p."lastEvent"',
  },
  {
    name: "Total Events",
    id: "totalEvents",
    type: "number",
    internal: 'p."totalEvents"',
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: 'p."totalTokens"',
  },
  {
    name: "Total Cost",
    id: "totalCost",
    type: "number",
    internal: 'p."totalCost"',
  },
];
