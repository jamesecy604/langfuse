import { z } from "zod";
import { env } from "@/src/env.mjs";
import { writeFileSync } from "fs";
import { join } from "path";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";

export const systemRouter = createTRPCRouter({
  getSystemOrg: protectedProcedure.query(() => {
    return env.SYSTEM_ORG_ID ?? null;
  }),

  setSystemOrg: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only allow if no system org is set yet
      if (env.SYSTEM_ORG_ID) {
        throw new Error("System organization already configured");
      }

      // Update .env file in web root
      try {
        const envPath = join(process.cwd(), "..", ".env");
        const envContent = `SYSTEM_ORG_ID=${input.orgId}\n`;
        writeFileSync(envPath, envContent, { flag: "a" });
        console.log(`Successfully wrote SYSTEM_ORG_ID to ${envPath}`);
      } catch (error) {
        console.error("Failed to write to .env file:", error);
        throw new Error("Failed to persist system organization ID");
      }

      return { success: true };
    }),
});
