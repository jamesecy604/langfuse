import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { redis } from "../../../../../packages/shared/src/server/redis/redis";

export const systemRouter = createTRPCRouter({
  getSystemOrg: protectedProcedure.query(async () => {
    return await redis?.get("system:orgId");
  }),

  setSystemOrg: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only allow if no system org is set yet
      const existingOrgId = await redis?.get("system:orgId");
      if (existingOrgId) {
        throw new Error("System organization already configured");
      }

      try {
        // Store in Redis
        await redis?.set("system:orgId", input.orgId);
        console.log(`Successfully stored SYSTEM_ORG_ID in Redis`);
      } catch (error) {
        console.error("Failed to persist system organization ID:", error);
        throw new Error("Failed to persist system organization ID");
      }

      return { success: true };
    }),
});
