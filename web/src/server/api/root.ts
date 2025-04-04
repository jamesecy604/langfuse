import { createTRPCRouter } from "@/src/server/api/trpc";
import { systemRouter } from "./routers/system";
import { traceRouter } from "./routers/traces";
import { generationsRouter } from "./routers/generations";
import { scoresRouter } from "./routers/scores";
import { dashboardRouter } from "@/src/features/dashboard/server/dashboard-router";
import { projectsRouter } from "@/src/features/projects/server/projectsRouter";
import { apiKeysRouter } from "@/src/features/public-api/server/apiKeyRouter";
import { userApiKeysRouter } from "@/src/features/public-api/server/userApiKeyRouter";
import { membersRouter } from "@/src/features/rbac/server/membersRouter";
import { userRouter } from "@/src/server/api/routers/users";
import { datasetRouter } from "@/src/features/datasets/server/dataset-router";

import { observationsRouter } from "@/src/server/api/routers/observations";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import { promptRouter } from "@/src/features/prompts/server/routers/promptRouter";
import { modelRouter } from "@/src/server/api/routers/models";

import { posthogIntegrationRouter } from "@/src/features/posthog-integration/posthog-integration-router";
import { llmApiKeyRouter } from "@/src/features/llm-api-key/server/router";
import { organizationsRouter } from "@/src/features/organizations/server/organizationRouter";
import { scoreConfigsRouter } from "@/src/server/api/routers/scoreConfigs";
import { publicRouter } from "@/src/server/api/routers/public";
import { credentialsRouter } from "@/src/features/auth-credentials/server/credentialsRouter";
import { batchExportRouter } from "@/src/features/batch-exports/server/batchExport";
import { utilsRouter } from "@/src/server/api/routers/utilities";
import { commentsRouter } from "@/src/server/api/routers/comments";
import { mediaRouter } from "@/src/server/api/routers/media";
import { backgroundMigrationsRouter } from "@/src/features/background-migrations/server/background-migrations-router";
import { auditLogsRouter } from "./routers/auditLogs";
import { tableRouter } from "@/src/features/table/server/tableRouter";
import { balanceRouter } from "@/src/server/api/routers/balance";
import { llmApiKeyUsageRouter } from "@/src/features/llm-api-key/server/usageRouter";
import { cachedModelsRouter } from "@/src/server/api/routers/cachedModels";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  batchExport: batchExportRouter,
  traces: traceRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  scoreConfigs: scoreConfigsRouter,
  dashboard: dashboardRouter,
  organizations: organizationsRouter,
  projects: projectsRouter,
  users: userRouter,
  apiKeys: apiKeysRouter,
  userApiKeys: userApiKeysRouter,
  members: membersRouter,
  datasets: datasetRouter,
  observations: observationsRouter,
  prompts: promptRouter,
  models: modelRouter,
  posthogIntegration: posthogIntegrationRouter,
  llmApiKey: llmApiKeyRouter,
  public: publicRouter,
  credentials: credentialsRouter,
  utilities: utilsRouter,
  comments: commentsRouter,
  media: mediaRouter,
  backgroundMigrations: backgroundMigrationsRouter,
  auditLogs: auditLogsRouter,
  table: tableRouter,
  balance: balanceRouter,
  llmApiKeyUsage: llmApiKeyUsageRouter,
  cachedModels: cachedModelsRouter,
  system: systemRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
