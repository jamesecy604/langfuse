import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getAuthOptions } from "@/src/server/auth";
import { prisma } from "../../../../../../../packages/shared/src/db";
import { getDecryptedApiKey } from "@/src/models/apiKey";

export async function GET(
  _: Request,
  { params }: { params: { apiKeyId: string } },
) {
  const session = await getServerSession(await getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await prisma.userApiKey.findUnique({
    where: {
      id: params.apiKeyId,
      userId: session.user.id,
    },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  try {
    const decryptedKey = await getDecryptedApiKey(apiKey.id, session.user.id);

    return NextResponse.json({ data: decryptedKey });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to decrypt API key" },
      { status: 500 },
    );
  }
}
