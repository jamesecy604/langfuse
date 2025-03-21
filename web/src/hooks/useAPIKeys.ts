import { useState, useEffect, useCallback } from "react";
import type { ApiKey } from "../models/apiKey";

interface APIKeysResponse {
  data: ApiKey[];
}

export function useAPIKeys() {
  const [data, setData] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/api-keys`);
      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }
      const json: APIKeysResponse = await response.json();
      setData(json.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading: loading,
    error,
    mutate: fetchData,
  };
}
