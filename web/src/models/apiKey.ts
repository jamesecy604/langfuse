import { prisma } from "../../../packages/shared/src/db";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";

export interface ApiKey {
  id: string;
  name: string;
  hashedKey: string;
  encryptedKey: string;
  createdAt: Date;
  userId: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  createdAt: Date;
}

interface CreateApiKeyParams {
  name: string;
  userId: string;
}

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error("API_KEY_ENCRYPTION_KEY environment variable is required");
}

const encrypt = (text: string): string => {
  const iv = randomBytes(16);
  const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex") as unknown as Uint8Array;
  const cipher = createCipheriv(
    "aes-256-cbc",
    keyBuffer,
    iv as unknown as Uint8Array,
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

const decrypt = (text: string): string => {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex") as unknown as Uint8Array;
  const encryptedText = textParts.join(":");
  const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex") as unknown as Uint8Array;
  const decipher = createDecipheriv("aes-256-cbc", keyBuffer, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

interface CreateApiKeyParams {
  name: string;
  userId: string;
}

const hashApiKey = (apiKey: string) => {
  return createHash("sha256").update(apiKey).digest("hex");
};

const generateUniqueApiKey = () => {
  const apiKey = randomBytes(16).toString("hex");

  return [hashApiKey(apiKey), apiKey];
};

export const createApiKey = async (params: CreateApiKeyParams) => {
  const { name, userId } = params;

  const [hashedKey, apiKey] = generateUniqueApiKey();
  const encryptedKey = encrypt(apiKey);

  await prisma.userApiKey.create({
    data: {
      name,
      hashedKey: hashedKey,
      encryptedKey: encryptedKey,
      user: { connect: { id: userId } },
      createdById: userId,
    },
  });

  return apiKey;
};

export const fetchApiKeys = async (userId: string) => {
  return prisma.userApiKey.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });
};

interface DeleteApiKeyParams {
  id: string;
  userId: string;
}

export const deleteApiKey = async (params: DeleteApiKeyParams) => {
  const { id, userId } = params;

  // Verify the API key belongs to the user before deleting
  const apiKey = await prisma.userApiKey.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!apiKey || apiKey.userId !== userId) {
    throw new Error("API key not found or not authorized");
  }

  return prisma.userApiKey.delete({
    where: { id },
  });
};

export const getApiKey = async (apiKey: string) => {
  return prisma.userApiKey.findUnique({
    where: {
      hashedKey: hashApiKey(apiKey),
    },
    select: {
      id: true,
    },
  });
};

export const getApiKeyById = async (id: string) => {
  return prisma.userApiKey.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      userId: true,
      encryptedKey: true,
    },
  });
};
export const getDecryptedApiKey = async (id: string, userId: string) => {
  const apiKey = await prisma.userApiKey.findUnique({
    where: {
      id,
      userId,
    },
    select: {
      encryptedKey: true,
    },
  });

  if (!apiKey?.encryptedKey) {
    throw new Error("API key not found or not accessible");
  }

  return decrypt(apiKey.encryptedKey);
};
