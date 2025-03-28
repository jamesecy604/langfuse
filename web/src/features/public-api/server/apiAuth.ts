import { env } from "@/src/env.mjs";
import {
  addUserToSpan,
  createShaHash,
  recordIncrement,
  verifySecretKey,
  type AuthHeaderVerificationResult,
  CachedApiKey,
  OrgEnrichedApiKey,
  logger,
  instrumentAsync,
} from "@langfuse/shared/src/server";
import {
  type PrismaClient,
  type ApiKey,
  type Prisma,
} from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type Redis } from "ioredis";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import { API_KEY_NON_EXISTENT } from "@langfuse/shared/src/server";
import { type z } from "zod";
import { CloudConfigSchema, isPlan } from "@langfuse/shared";

export class ApiAuthService {
  prisma: PrismaClient;
  redis: Redis | null;

  constructor(prisma: PrismaClient, redis: Redis | null) {
    this.prisma = prisma;
    this.redis = redis;
  }

  // this function needs to be called, when the organisation is updated
  // - when projects move across organisations, the orgId in the API key cache needs to be updated
  // - when the plan of the org changes, the plan in the API key cache needs to be updated as well
  async invalidate(apiKeys: ApiKey[], identifier: string) {
    const hashKeys = apiKeys.map((key) => key.fastHashedSecretKey);

    const filteredHashKeys = hashKeys.filter((hash): hash is string =>
      Boolean(hash),
    );
    if (filteredHashKeys.length === 0) {
      logger.info("No valid keys to invalidate");
      return;
    }

    if (this.redis) {
      logger.info(`Invalidating API keys in redis for ${identifier}`);
      await this.redis.del(
        filteredHashKeys.map((hash) => this.createRedisKey(hash)),
      );
    }
  }

  async invalidateOrgApiKeys(orgId: string) {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        project: {
          orgId: orgId,
        },
      },
    });

    await this.invalidate(apiKeys, `org ${orgId}`);
  }

  async invalidateProjectApiKeys(projectId: string) {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        projectId: projectId,
      },
    });

    await this.invalidate(apiKeys, `project ${projectId}`);
  }

  async deleteApiKey(id: string, projectId: string) {
    // Make sure the API key exists and belongs to the project the user has access to
    const apiKey = await this.prisma.apiKey.findFirstOrThrow({
      where: {
        id: id,
        projectId: projectId,
      },
    });
    if (!apiKey) {
      return false;
    }

    // if redis is available, delete the key from there as well
    // delete from redis even if caching is disabled via env for consistency
    this.invalidate([apiKey], `key ${id}`);

    await this.prisma.apiKey.delete({
      where: {
        id: apiKey.id,
      },
    });
    return true;
  }

  async deleteUserApiKey(id: string, userId: string) {
    // Make sure the API key exists and belongs to the project the user has access to
    const apiKey = await this.prisma.userApiKey.findFirstOrThrow({
      where: {
        id: id,
        userId: userId,
      },
    });
    if (!apiKey) {
      return false;
    }

    // if redis is available, delete the key from there as well
    // delete from redis even if caching is disabled via env for consistency
    this.invalidate([apiKey], `key ${id}`);

    await this.prisma.userApiKey.delete({
      where: {
        id: apiKey.id,
      },
    });
    return true;
  }

  async verifyAuthHeaderAndReturnScope(
    authHeader: string | undefined,
  ): Promise<AuthHeaderVerificationResult> {
    return instrumentAsync({ name: "api-auth-verify" }, async () => {
      if (!authHeader) {
        logger.error("No authorization header");
        return {
          validKey: false,
          error: "No authorization header",
        };
      }

      try {
        // Basic auth, full scope, needs secret key and public key
        if (authHeader.startsWith("Basic ")) {
          const { username: reqPublicKey, password: reqSecretKey } =
            this.extractBasicAuthCredentials(authHeader);
          let publicKey = reqPublicKey;
          let secretKey = reqSecretKey;

          if (publicKey) {
            const salt = env.SALT;
            const hashFromProvidedKey = createShaHash(secretKey, salt);

            // Fetch from redis or fallback to postgres
            const userApiKey =
              await this.fetchUserApiKeyAndAddToRedis(hashFromProvidedKey);

            let finalUserApiKey = userApiKey;

            if (!userApiKey || !userApiKey.fastHashedSecretKey) {
              const slowKey = await this.prisma.userApiKey.findUnique({
                where: { publicKey },
                include: {
                  project: { include: { organization: true } },
                  user: true, // Include user relation
                },
              });

              if (!slowKey) {
                logger.error("No key found for public key", publicKey);
                if (this.redis) {
                  logger.info(
                    `No key found, storing ${API_KEY_NON_EXISTENT} in redis`,
                  );
                  await this.addApiKeyToRedis(
                    hashFromProvidedKey,
                    API_KEY_NON_EXISTENT,
                  );
                }
                throw new Error("Invalid credentials");
              }

              const isValid = await verifySecretKey(
                secretKey,
                slowKey.hashedSecretKey,
              );

              if (!isValid) {
                logger.debug(`Old key is invalid: ${publicKey}`);
                throw new Error("Invalid credentials");
              }

              const shaKey = createShaHash(secretKey, salt);

              await this.prisma.userApiKey.update({
                where: { publicKey },
                data: {
                  fastHashedSecretKey: shaKey,
                },
              });

              finalUserApiKey = convertToRedisRepresentation({
                ...slowKey,
                fastHashedSecretKey: shaKey,
              });
            }

            if (!finalUserApiKey) {
              logger.info("No project id found for key", publicKey);
              throw new Error("Invalid credentials");
            }

            // Add userId to tracing
            addUserToSpan({
              userId: finalUserApiKey.userId,
              projectId: finalUserApiKey.projectId,
            });

            const plan = finalUserApiKey.plan;

            if (!isPlan(plan)) {
              logger.error("Invalid plan type for key", finalUserApiKey.plan);
              throw new Error("Invalid credentials");
            }

            return {
              validKey: true,
              scope: {
                projectId: finalUserApiKey.projectId,
                userId: finalUserApiKey.userId, // Add userId to scope
                accessLevel: "all",
                orgId: finalUserApiKey.orgId,
                plan: plan,
                rateLimitOverrides: finalUserApiKey.rateLimitOverrides ?? [],
                apiKeyId: finalUserApiKey.id,
              },
            };
          } else {
            if (!reqPublicKey && reqSecretKey.startsWith("sk-")) {
              const parts = reqSecretKey.split("-");
              if (parts.length === 3 && parts[0] === "sk") {
                publicKey = parts[1];
                secretKey = parts[2];
              } else {
                throw new Error("Invalid API key format");
              }
            }

            const salt = env.SALT;
            const hashFromProvidedKey = createShaHash(secretKey, salt);

            // fetches by redis if available, fallback to postgres
            const userApiKey =
              await this.fetchUserApiKeyAndAddToRedis(hashFromProvidedKey);

            let finalApiKey = userApiKey;

            if (!userApiKey || !userApiKey.fastHashedSecretKey) {
              const slowKey = await this.prisma.userApiKey.findUnique({
                where: { publicKey },
                include: { project: { include: { organization: true } } },
              });

              if (!slowKey) {
                logger.error("No key found for public key", publicKey);
                if (this.redis) {
                  logger.info(
                    `No key found, storing ${API_KEY_NON_EXISTENT} in redis`,
                  );
                  await this.addApiKeyToRedis(
                    hashFromProvidedKey,
                    API_KEY_NON_EXISTENT,
                  );
                }
                throw new Error("Invalid credentials");
              }

              const isValid = await verifySecretKey(
                secretKey,
                slowKey.hashedSecretKey,
              );

              if (!isValid) {
                logger.debug(`Old key is invalid: ${publicKey}`);
                throw new Error("Invalid credentials");
              }

              const shaKey = createShaHash(secretKey, salt);

              // Update fastHashedSecretKey if it's different
              if (slowKey.fastHashedSecretKey !== shaKey) {
                await this.prisma.userApiKey.update({
                  where: { publicKey },
                  data: {
                    fastHashedSecretKey: shaKey,
                  },
                });
              }
              finalApiKey = convertToRedisRepresentation({
                ...slowKey,
                fastHashedSecretKey: shaKey,
              });
              // Add to Redis with the new hash
              await this.addApiKeyToRedis(shaKey, finalApiKey);
            }

            if (!finalApiKey) {
              logger.info("No project id found for key", publicKey);
              throw new Error("Invalid credentials");
            }

            addUserToSpan({ projectId: finalApiKey.projectId });

            const plan = finalApiKey.plan;

            if (!isPlan(plan)) {
              logger.error("Invalid plan type for key", finalApiKey.plan);
              throw new Error("Invalid credentials");
            }

            return {
              validKey: true,
              scope: {
                projectId: finalApiKey.projectId,
                accessLevel: "all",
                orgId: finalApiKey.orgId,
                plan: plan,
                rateLimitOverrides: finalApiKey.rateLimitOverrides ?? [],
                apiKeyId: finalApiKey.id,
              },
            };
          }
        }
        // Bearer auth, limited scope, only needs public key
        if (authHeader.startsWith("Bearer ")) {
          const publicKey = authHeader.replace("Bearer ", "");

          const dbKey = await this.findDbKeyOrThrow(publicKey);

          addUserToSpan({ projectId: dbKey.projectId });

          const cloudConfig = dbKey.project.organization.cloudConfig
            ? CloudConfigSchema.parse(dbKey.project.organization.cloudConfig)
            : undefined;

          return {
            validKey: true,
            scope: {
              projectId: dbKey.projectId,
              accessLevel: "scores",
              orgId: dbKey.project.organization.id,
              plan: getOrganizationPlanServerSide(cloudConfig),
              rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
              apiKeyId: dbKey.id,
            },
          };
        }
      } catch (error: unknown) {
        logger.error(
          `Error verifying auth header: ${error instanceof Error ? error.message : null}`,
          error,
        );

        if (isPrismaException(error)) {
          throw error;
        }

        return {
          validKey: false,
          error:
            (error instanceof Error ? error.message : "Authorization error") +
            ". Confirm that you've configured the correct host.",
        };
      }
      return {
        validKey: false,
        error: "Invalid authorization header",
      };
    });
  }

  async verifyAuthHeaderAndReturnUserId(
    authHeader: string | undefined,
  ): Promise<string | undefined> {
    if (!authHeader) {
      logger.error("No authorization header");
      return undefined;
    }
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("No Bearer");
    }
    const apiKeyValue = authHeader.substring(7);
    const keyParts = apiKeyValue.split("-");
    if (keyParts.length !== 3) {
      throw new Error(
        "Invalid API key format - must be in format sk-<publicKey>-<secretKey>",
      );
    }
    const publicKey = keyParts[1];
    const secretKey = keyParts[2];
    if (publicKey && secretKey) {
      const salt = env.SALT;
      const hashFromProvidedKey = createShaHash(secretKey, salt);

      // Fetch from redis or fallback to postgres
      const userApiKey =
        await this.fetchUserApiKeyAndAddToRedis(hashFromProvidedKey);

      let finalUserApiKey = userApiKey;

      if (!userApiKey || !userApiKey.fastHashedSecretKey) {
        const slowKey = await this.prisma.userApiKey.findUnique({
          where: { publicKey },
          include: {
            project: { include: { organization: true } },
            user: true, // Include user relation
          },
        });

        if (!slowKey) {
          logger.error("No key found for public key", publicKey);
          if (this.redis) {
            logger.info(
              `No key found, storing ${API_KEY_NON_EXISTENT} in redis`,
            );
            await this.addApiKeyToRedis(
              hashFromProvidedKey,
              API_KEY_NON_EXISTENT,
            );
          }
          throw new Error("Invalid credentials");
        }

        const isValid = await verifySecretKey(
          secretKey,
          slowKey.hashedSecretKey,
        );

        if (!isValid) {
          logger.debug(`Old key is invalid: ${publicKey}`);
          throw new Error("Invalid credentials");
        }

        const shaKey = createShaHash(secretKey, salt);

        await this.prisma.userApiKey.update({
          where: { publicKey },
          data: {
            fastHashedSecretKey: shaKey,
          },
        });

        finalUserApiKey = convertToRedisRepresentation({
          ...slowKey,
          fastHashedSecretKey: shaKey,
        });
      }

      if (!finalUserApiKey) {
        logger.info("No project id found for key", publicKey);
        throw new Error("Invalid credentials");
      }
      return finalUserApiKey.userId;
    } else {
      return undefined;
    }
  }

  extractBasicAuthCredentials(basicAuthHeader: string): {
    username: string;
    password: string;
  } {
    const authValue = basicAuthHeader.split(" ")[1];
    if (!authValue) throw new Error("Invalid authorization header");

    const [username, password] = atob(authValue).split(":");
    if (!username || !password) throw new Error("Invalid authorization header");
    return { username, password };
  }

  async findDbKeyOrThrow(publicKey: string) {
    const dbKey = await this.prisma.apiKey.findUnique({
      where: { publicKey },
      include: { project: { include: { organization: true } } },
    });
    if (!dbKey) {
      logger.info("No api key found for public key:", publicKey);
      throw new Error("Invalid public key");
    }
    return dbKey;
  }

  async fetchApiKeyAndAddToRedis(hash: string) {
    // first get the API key from redis, this does not throw
    const redisApiKey = await this.fetchApiKeyFromRedis(hash);

    if (redisApiKey === API_KEY_NON_EXISTENT) {
      recordIncrement("langfuse.api_key.cache_hit", 1);
      throw new Error("Invalid credentials");
    }

    // if we found something, return the object.
    if (redisApiKey) {
      recordIncrement("langfuse.api_key.cache_hit", 1);
      return redisApiKey;
    }

    recordIncrement("langfuse.api_key.cache_miss", 1);

    // if redis not available or object not found, try the database
    const apiKeyAndOrganisation = await this.prisma.userApiKey.findUnique({
      where: { fastHashedSecretKey: hash },
      include: { project: { include: { organization: true } } },
    });

    // add the key to redis for future use if available, this does not throw
    // only do so if the new hashkey exists already.
    if (apiKeyAndOrganisation && apiKeyAndOrganisation.fastHashedSecretKey) {
      await this.addApiKeyToRedis(
        hash,
        convertToRedisRepresentation(apiKeyAndOrganisation),
      );
    }
    return apiKeyAndOrganisation
      ? convertToRedisRepresentation(apiKeyAndOrganisation)
      : null;
  }

  async fetchUserApiKeyAndAddToRedis(hash: string) {
    // first get the API key from redis, this does not throw
    const redisApiKey = await this.fetchApiKeyFromRedis(hash);

    if (redisApiKey === API_KEY_NON_EXISTENT) {
      recordIncrement("langfuse.api_key.cache_hit", 1);
      throw new Error("Invalid credentials");
    }

    // if we found something, return the object.
    if (redisApiKey) {
      recordIncrement("langfuse.api_key.cache_hit", 1);
      return redisApiKey;
    }
    console.log("=======================================================");
    recordIncrement("langfuse.api_key.cache_miss", 1);

    // if redis not available or object not found, try the database
    const userApiKeyAndOrganisation = await this.prisma.userApiKey.findUnique({
      where: { fastHashedSecretKey: hash },
      include: {
        project: { include: { organization: true } },
        user: true, // Include user relation
      },
    });

    // add the key to redis for future use if available, this does not throw
    if (userApiKeyAndOrganisation) {
      // Ensure we're using the correct fastHashedSecretKey
      const redisKey = userApiKeyAndOrganisation.fastHashedSecretKey || hash;
      await this.addApiKeyToRedis(
        redisKey,
        convertToRedisRepresentation(userApiKeyAndOrganisation),
      );
    }

    return userApiKeyAndOrganisation
      ? convertToRedisRepresentation(userApiKeyAndOrganisation)
      : null;
  }

  async addApiKeyToRedis(
    hash: string,
    newApiKey: z.infer<typeof OrgEnrichedApiKey> | typeof API_KEY_NON_EXISTENT,
  ) {
    if (!this.redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") {
      return;
    }

    try {
      await this.redis.set(
        this.createRedisKey(hash),
        JSON.stringify(newApiKey),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS, // redis API is in seconds
      );
    } catch (error: unknown) {
      logger.error("Error adding key to redis", error);
    }
  }

  async fetchApiKeyFromRedis(hash: string) {
    if (!this.redis || env.LANGFUSE_CACHE_API_KEY_ENABLED !== "true") {
      return null;
    }

    try {
      const redisApiKey = await this.redis.getex(
        this.createRedisKey(hash),
        "EX",
        env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS, // redis API is in seconds
      );

      if (!redisApiKey) {
        return null;
      }

      const parsedApiKey = CachedApiKey.safeParse(JSON.parse(redisApiKey));

      if (parsedApiKey.success) {
        return parsedApiKey.data;
      }

      if (!parsedApiKey.success) {
        logger.error(
          "Failed to parse API key from Redis, deleting existing key from cache",
          parsedApiKey.error,
        );
        await this.redis.del(this.createRedisKey(hash));
      }
      return null;
    } catch (error: unknown) {
      logger.error("Error fetching key from redis", error);
      return null;
    }
  }

  createRedisKey(hash: string) {
    return `api-key:${hash}`;
  }
}

export const convertToRedisRepresentation = (
  apiKeyAndOrganisation: ApiKey & {
    project: {
      id: string;
      organization: {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        cloudConfig: Prisma.JsonValue;
      };
    };
    user?: {
      id: string;
    };
  },
) => {
  const {
    project: {
      organization: { id: orgId, cloudConfig: cloudConfig },
    },
  } = apiKeyAndOrganisation;

  const parsedCloudConfig = cloudConfig
    ? CloudConfigSchema.parse(cloudConfig)
    : undefined;

  const newApiKey = OrgEnrichedApiKey.parse({
    ...apiKeyAndOrganisation,
    createdAt: apiKeyAndOrganisation.createdAt?.toISOString(),
    orgId,
    plan: getOrganizationPlanServerSide(parsedCloudConfig),
    rateLimitOverrides: parsedCloudConfig?.rateLimitOverrides,
    userId: apiKeyAndOrganisation.user?.id,
  });

  if (!orgId) {
    logger.error("No organization found for key");
    throw new Error("Invalid credentials");
  }

  return newApiKey;
};
