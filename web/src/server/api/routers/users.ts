import { z } from "zod";
import type { inferProcedureInput } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, singleFilter } from "@langfuse/shared";
import {
  getTotalUserCount,
  getTracesGroupedByUsers,
  getUserMetrics,
  hasAnyUser,
  getTracesGroupedByUser,
  getTotalUserCountByUser,
  getUserMetricsByUser,
} from "@langfuse/shared/src/server";

const UserFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const UserAllOptions = UserFilterOptions.extend({
  ...paginationZod,
});

const GlobalUserFilterOptions = z.object({
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const GlobalUserAllOptions = GlobalUserFilterOptions.extend({
  ...paginationZod,
});

export const userRouter = createTRPCRouter({
  allGlobal: protectedProcedure
    .input(GlobalUserAllOptions)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user?.id;
      if (!userId) return { totalUsers: 0, users: [] };

      // Get user's data across all projects
      const [userList, totalUsers] = await Promise.all([
        getTracesGroupedByUser(
          userId,
          input.filter ?? [],
          input.searchQuery ?? undefined,
          input.limit,
          input.page,
        ),
        getTotalUserCountByUser(
          userId,
          input.filter ?? [],
          input.searchQuery ?? undefined,
        ),
      ]);

      // Get metrics if needed
      const metrics =
        input.limit > 0 && userId
          ? await getUserMetricsByUser(userId, input.filter ?? [])
          : [];

      return {
        totalUsers: totalUsers.shift()?.totalCount ?? 0,
        users: userList.map((user) => ({
          userId: user.user,
          totalTraces: BigInt(user.count),
          ...metrics.find((m) => m.userId === user.user),
        })),
      };
    }),

  metricsGlobal: protectedProcedure
    .input(
      z.object({
        userIds: z.array(z.string().min(1)),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user?.id;
      if (input.userIds.length === 0) {
        return [];
      }
      const metrics = userId
        ? await getUserMetricsByUser(userId, input.filter ?? [])
        : [];

      return metrics.map((metric) => ({
        userId: metric.userId,
        environment: metric.environment,
        firstTrace: metric.minTimestamp,
        lastTrace: metric.maxTimestamp,
        totalPromptTokens: BigInt(metric.inputUsage),
        totalCompletionTokens: BigInt(metric.outputUsage),
        totalTokens: BigInt(metric.totalUsage),
        totalObservations: BigInt(metric.observationCount),
        totalTraces: BigInt(metric.traceCount),
        sumCalculatedTotalCost: metric.totalCost,
      }));
    }),

  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return await hasAnyUser(input.projectId);
    }),

  all: protectedProjectProcedure
    .input(UserAllOptions)
    .query(async ({ input, ctx }) => {
      // First get user list and total count
      const [userList, totalUsers] = await Promise.all([
        getTracesGroupedByUsers(
          ctx.session.projectId,
          input.filter ?? [],
          input.searchQuery ?? undefined,
          input.limit,
          input.page,
          undefined,
        ),
        getTotalUserCount(
          ctx.session.projectId,
          input.filter ?? [],
          input.searchQuery ?? undefined,
        ),
      ]);

      // Then get metrics if needed
      const metrics =
        input.limit > 0
          ? await getUserMetrics(
              ctx.session.projectId,
              userList.map((u) => u.user),
              input.filter ?? [],
            )
          : [];

      return {
        totalUsers: totalUsers.shift()?.totalCount ?? 0,
        users: userList.map((user) => ({
          userId: user.user,
          totalTraces: BigInt(user.count),
          ...metrics.find((m) => m.userId === user.user),
        })),
      };
    }),

  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userIds: z.array(z.string().min(1)),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input }) => {
      if (input.userIds.length === 0) {
        return [];
      }
      const metrics = await getUserMetrics(
        input.projectId,
        input.userIds,
        input.filter ?? [],
      );

      return metrics.map((metric) => ({
        userId: metric.userId,
        environment: metric.environment,
        firstTrace: metric.minTimestamp,
        lastTrace: metric.maxTimestamp,
        totalPromptTokens: BigInt(metric.inputUsage),
        totalCompletionTokens: BigInt(metric.outputUsage),
        totalTokens: BigInt(metric.totalUsage),
        totalObservations: BigInt(metric.observationCount),
        totalTraces: BigInt(metric.traceCount),
        sumCalculatedTotalCost: metric.totalCost,
      }));
    }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const result = (
        await getUserMetrics(input.projectId, [input.userId], [])
      ).shift();

      return {
        userId: input.userId,
        firstTrace: result?.minTimestamp,
        lastTrace: result?.maxTimestamp,
        totalTraces: result?.traceCount ?? 0,
        totalPromptTokens: result?.inputUsage ?? 0,
        totalCompletionTokens: result?.outputUsage ?? 0,
        totalTokens: result?.totalUsage ?? 0,
        totalObservations: result?.observationCount ?? 0,
        sumCalculatedTotalCost: result?.totalCost ?? 0,
      };
    }),
});
