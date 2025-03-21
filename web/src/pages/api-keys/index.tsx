import APIKeysContainer from "../../components/apiKey/APIKeysContainer";
import Layout from "../../components/layouts/layout";

import { useRouter } from "next/router";
import Head from "next/head";

export default function APIKeysPage() {
  return (
    <>
      <Head>
        <title>API Keys | Langfuse</title>
        <meta name="description" content="Manage your API keys" />
      </Head>
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-8 text-2xl font-bold">API Keys</h1>
          <APIKeysContainer />
        </div>
      </Layout>
    </>
  );
}
