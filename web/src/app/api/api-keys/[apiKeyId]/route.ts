import { deleteApiKey } from "../../../../models/apiKey";

import { deleteApiKeySchema, validateWithSchema } from "../../../../lib/zod";

import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/src/server/auth";

export async function DELETE(
  request: Request,
  { params }: { params: { apiKeyId: string } },
) {
  try {
    const session = await getServerSession(await getAuthOptions());
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: { message: "Unauthorized" } }),
        { status: 401 },
      );
    }

    const validatedParams = validateWithSchema(deleteApiKeySchema, params);
    await deleteApiKey({
      id: validatedParams.apiKeyId,
      userId: session.user.id,
    });

    return new Response(null, { status: 204 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    const status =
      error instanceof Error && "status" in error ? error.status : 500;

    return new Response(JSON.stringify({ error: { message } }), {
      status: Number(status),
      headers: { "Content-Type": "application/json" },
    });
  }
}
