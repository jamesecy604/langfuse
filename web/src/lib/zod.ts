import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const deleteApiKeySchema = z.object({
  apiKeyId: z.string().min(1, "API Key ID is required"),
});

export const validateWithSchema = <T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(result.error.errors[0]?.message || "Invalid input");
  }
  return result.data;
};
