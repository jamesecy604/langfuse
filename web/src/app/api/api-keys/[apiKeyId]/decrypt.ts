import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { getAuthOptions } from '@/lib/nextAuth';
import { getDecryptedApiKey } from '@/models/apiKey';
import { getTeam } from '@/models/team';
import { checkAccess , getCachedSession} from '@/lib/permissions';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getCachedSession(req, res);
    //const session = await getServerSession(req, res, getAuthOptions(req, res));
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { slug, apiKeyId } = req.query;
    if (typeof slug !== 'string' || typeof apiKeyId !== 'string') {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    // Verify team access
    const team = await getTeam({ slug });
    // Check if user has permission to read API keys
   
    const { allowed } = await checkAccess(session, 'team_api_key', 'read');
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get and decrypt the API key
    const decryptedKey = await getDecryptedApiKey(apiKeyId, session.user.id);
    
    return res.status(200).json({ data: decryptedKey });
  } catch (error) {
    console.error('API key decryption error:', error);
    if (error instanceof Error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
