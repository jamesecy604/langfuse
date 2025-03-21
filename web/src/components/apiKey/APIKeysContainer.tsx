import APIKeys from "./APIKeys";
import { useAPIKeys } from "../../hooks/useAPIKeys";
import type { ApiKey } from "../../models/apiKey";

const APIKeysContainer = () => {
  const { data, isLoading, error, mutate } = useAPIKeys();

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">Error: {error.message}</div>
    );
  }

  const handleDelete = async (apiKey: ApiKey) => {
    try {
      await fetch(`/api/api-keys/${apiKey.id}`, {
        method: "DELETE",
      });
      // Refetch API keys after deletion
      mutate();
    } catch (error) {
      console.error("Failed to delete API key:", error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">user api keys</h1>
      <APIKeys apiKeys={data} onDelete={handleDelete} />
    </div>
  );
};

export default APIKeysContainer;
