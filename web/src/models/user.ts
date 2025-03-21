import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";
import { getAuthOptions } from "@/src/server/auth";

// Get current user from session in API routes
export const getCurrentUser = async (request: NextRequest | Request) => {
  const session = await getServerSession(await getAuthOptions());

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session.user;
};

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
