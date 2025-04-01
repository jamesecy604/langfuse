import { env } from "@/src/env.mjs";
import { prisma, Role } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

export async function createProjectMembershipsOnSignup(user: {
  id: string;
  email: string | null;
}) {
  try {
    // SYSTEM_ORG_ID must exist for this function
    if (!env.SYSTEM_ORG_ID) {
      throw new Error("SYSTEM_ORG_ID is not set");
    }

    // Find default project (isDefault=true)
    // Find default project (isDefault=true)
    const defaultProject = await prisma.project.findFirst({
      where: {
        isDefault: true,
      },
    });

    if (!defaultProject) {
      logger.error("No default project found for new user");
      return;
    }

    // Create organization membership for SYSTEM_ORG_ID with VIEWER role
    const orgMembership = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        orgId: env.SYSTEM_ORG_ID,
        role: Role.VIEWER,
      },
    });

    // Create project membership for default project with VIEWER role
    await prisma.projectMembership.create({
      data: {
        userId: user.id,
        projectId: defaultProject.id,
        orgMembershipId: orgMembership.id,
        role: Role.VIEWER,
      },
    });

    // Existing demo project and invitation handling
    const demoProject =
      env.NEXT_PUBLIC_DEMO_ORG_ID && env.NEXT_PUBLIC_DEMO_PROJECT_ID
        ? ((await prisma.project.findUnique({
            where: {
              orgId: env.NEXT_PUBLIC_DEMO_ORG_ID,
              id: env.NEXT_PUBLIC_DEMO_PROJECT_ID,
            },
          })) ?? undefined)
        : undefined;
    if (demoProject !== undefined) {
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          orgId: demoProject.orgId,
          role: Role.VIEWER,
        },
      });
    }

    if (user.email) await processMembershipInvitations(user.email, user.id);
  } catch (e) {
    logger.error("Error assigning project access to new user", e);
  }
}

async function processMembershipInvitations(email: string, userId: string) {
  const invitationsForUser = await prisma.membershipInvitation.findMany({
    where: {
      email: email.toLowerCase(),
    },
  });
  if (invitationsForUser.length === 0) return;

  const createOrgMembershipData = invitationsForUser.map((invitation) => ({
    userId: userId,
    orgId: invitation.orgId,
    role: invitation.orgRole,
    ...(invitation.projectId && invitation.projectRole
      ? {
          ProjectMemberships: {
            create: {
              userId: userId,
              projectId: invitation.projectId,
              role: invitation.projectRole,
            },
          },
        }
      : {}),
  }));

  const createOrgMembershipsPromises = createOrgMembershipData.map(
    (inviteData) => prisma.organizationMembership.create({ data: inviteData }),
  );

  await prisma.$transaction([
    ...createOrgMembershipsPromises,
    prisma.membershipInvitation.deleteMany({
      where: {
        id: {
          in: invitationsForUser.map((invitation) => invitation.id),
        },
        email: email.toLowerCase(),
      },
    }),
  ]);
}
