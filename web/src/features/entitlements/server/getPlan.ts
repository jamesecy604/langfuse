import { type Plan } from "@langfuse/shared";
import { type CloudConfigSchema } from "@langfuse/shared";

/**
 * Get the plan of the organization based on the cloud configuration. Used to add this plan to the organization object in JWT via NextAuth.
 */
export function getOrganizationPlanServerSide(
  cloudConfig?: CloudConfigSchema,
): Plan {
  if (process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    if (cloudConfig?.plan) {
      switch (cloudConfig.plan) {
        case "Hobby":
          return "cloud:hobby";
        case "Pro":
          return "cloud:pro";
        case "Team":
          return "cloud:team";
        case "Enterprise":
          return "cloud:enterprise";
      }
    }
    return "cloud:hobby";
  }
  return "oss";
}
