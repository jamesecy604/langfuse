import { z } from "zod";
import type { inferProcedureInput } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, singleFilter } from "@langfuse/shared";
import {
  getTotalProjectCount,
  getProjectMetrics,
  hasAnyProject,
  getTracesGroupedByProjects,
} from "@langfuse/shared/src/server";

const ProjectFilterOptions = z.object({
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const ProjectAllOptions = ProjectFilterOptions.extend({
  ...paginationZod,
});

const GlobalProjectFilterOptions = z.object({
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const GlobalProjectAllOptions = GlobalProjectFilterOptions.extend({
  ...paginationZod,
});

export const projectTraceRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(z.object({}))
    .query(async ({ input }) => {
      return await hasAnyProject();
    }),

  all: protectedProcedure
    .input(ProjectAllOptions)
    .query(async ({ input, ctx }) => {
      // First get user list and total count
      const [projectList, totalProjects] = await Promise.all([
        getTracesGroupedByProjects(
          input.filter ?? [],
          input.searchQuery ?? undefined,
          input.limit,
          input.page,
          undefined,
        ),
        getTotalProjectCount(
          input.filter ?? [],
          input.searchQuery ?? undefined,
        ),
      ]);

      // Then get metrics if needed
      const metrics =
        input.limit > 0
          ? await getProjectMetrics(
              projectList.map((p) => p.project),
              input.filter ?? [],
            )
          : [];

      return {
        totalProjects: totalProjects.shift()?.totalCount ?? 0,
        projects: projectList.map((project) => ({
          projectId: project.project,
          totalTraces: BigInt(project.count),
          ...metrics.find((m) => m.projectId === project.project),
        })),
      };
    }),

  metrics: protectedProcedure
    .input(
      z.object({
        projectIds: z.array(z.string().min(1)),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.projectIds.length === 0) {
        return [];
      }
      const metrics = await getProjectMetrics(
        input.projectIds,
        input.filter ?? [],
      );

      // Get project names first
      const projects = await ctx.prisma.project.findMany({
        where: {
          id: { in: input.projectIds },
        },
        select: {
          id: true,
          name: true,
        },
      });

      return metrics.map((metric) => {
        const project = projects.find(
          (p: { id: string }) => p.id === metric.projectId,
        );
        return {
          projectId: metric.projectId,
          name: project?.name ?? "Unknown",
          environment: metric.environment,
          firstTrace: metric.minTimestamp,
          lastTrace: metric.maxTimestamp,
          totalPromptTokens: BigInt(metric.inputUsage),
          totalCompletionTokens: BigInt(metric.outputUsage),
          totalTokens: BigInt(metric.totalUsage),
          totalObservations: BigInt(metric.observationCount),
          totalTraces: BigInt(metric.traceCount),
          sumCalculatedTotalCost: metric.totalCost,
        };
      });
    }),

  // byId: protectedProjectProcedure
  //   .input(
  //     z.object({
  //       projectId: z.string(),
  //     }),
  //   )
  //   .query(async ({ input }) => {
  //     const result = (
  //       await getProjectMetrics(input.projectId, [input.projectId], [])
  //     ).shift();

  //     return {
  //       projectId: input.projectId,
  //       firstTrace: result?.minTimestamp,
  //       lastTrace: result?.maxTimestamp,
  //       totalTraces: result?.traceCount ?? 0,
  //       totalPromptTokens: result?.inputUsage ?? 0,
  //       totalCompletionTokens: result?.outputUsage ?? 0,
  //       totalTokens: result?.totalUsage ?? 0,
  //       totalObservations: result?.observationCount ?? 0,
  //       sumCalculatedTotalCost: result?.totalCost ?? 0,
  //     };
  //   }),
});
