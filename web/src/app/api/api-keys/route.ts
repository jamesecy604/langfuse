import {
  createApiKey,
  fetchApiKeys,
  deleteApiKey,
} from "../../../models/apiKey";
import { getCurrentUser } from "../../../models/user";
import { createApiKeySchema, validateWithSchema } from "../../../lib/zod";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }

    const apiKeys = await fetchApiKeys(user.id);
    return NextResponse.json({ data: apiKeys });
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: error.message || "Something went wrong" } },
      { status: error.status || 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { name } = validateWithSchema(createApiKeySchema, body);

    const apiKey = await createApiKey({
      name,
      userId: user.id,
    });

    return NextResponse.json(
      {
        data: {
          apiKey,
          message: "API key created successfully",
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: error.message || "Something went wrong" } },
      { status: error.status || 500 },
    );
  }
}
