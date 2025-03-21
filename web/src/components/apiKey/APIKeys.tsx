import { useState } from "react";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/useToast";
import NewAPIKey from "./NewAPIKey";
import type { ApiKey } from "../../models/apiKey";
import CopyToClipboardButton from "../shared/CopyToClipboardButton";

interface APIKeysProps {
  apiKeys: ApiKey[];
  onDelete: (apiKey: ApiKey) => Promise<void>;
}

const APIKeys = ({ apiKeys, onDelete }: APIKeysProps) => {
  const { toast } = useToast();
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKey | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const deleteApiKey = async (apiKey: ApiKey | null) => {
    if (!apiKey) return;

    const response = await fetch(`/api/api-keys/${apiKey.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error("Failed to delete API key");
      return;
    }

    toast.success("API key deleted");
    setSelectedApiKey(null);
    await onDelete(apiKey);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">API Keys</h2>
          <p className="text-sm text-gray-600">
            Manage API keys for authentication
          </p>
        </div>
        <Button variant="default" onClick={() => setCreateModalVisible(true)}>
          Create API Key
        </Button>
      </div>

      {apiKeys.length > 0 ? (
        <div className="space-y-2">
          {apiKeys.map((apiKey) => (
            <div key={apiKey.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{apiKey.name}</p>
                  <p className="text-sm text-gray-600">
                    Created: {new Date(apiKey.createdAt).toLocaleDateString()}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-600">
                      ••••••••••••••••
                    </span>
                    <CopyToClipboardButton
                      value={async () => {
                        const response = await fetch(
                          `/api/api-keys/${apiKey.id}/decrypt`,
                          {
                            method: "GET",
                          },
                        );

                        if (!response.ok) {
                          throw new Error("Failed to fetch API key");
                        }

                        const { data } = await response.json();
                        return data;
                      }}
                    />
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (
                      confirm("Are you sure you want to delete this API key?")
                    ) {
                      deleteApiKey(apiKey);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded bg-gray-50 p-4 text-gray-600">
          No API keys found
        </div>
      )}

      {createModalVisible && (
        <NewAPIKey
          onClose={() => setCreateModalVisible(false)}
          onCreateSuccess={() => {
            setCreateModalVisible(false);
          }}
        />
      )}
    </div>
  );
};

export default APIKeys;
