import { HostNameProject } from "@/src/features/projects/components/HostNameProject";
import RenameProject from "@/src/features/projects/components/RenameProject";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { TransferProjectButton } from "@/src/features/projects/components/TransferProjectButton";
import { DeleteProjectButton } from "@/src/features/projects/components/DeleteProjectButton";
import Header from "@/src/components/layouts/header";
import ConfigureRetention from "@/src/features/projects/components/ConfigureRetention";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { toast } from "sonner";

export function GeneralSettings({
  baseUrl,
  project,
  organization,
  showRetentionSettings,
}: {
  project: { id: string; name: string; isDefault?: boolean };
  organization: { id: string; name: string };
  showRetentionSettings: boolean;
  baseUrl?: string;
}) {
  const { data: session } = useSession();
  const currentProject = session?.user?.organizations
    .flatMap((org) => org.projects)
    .find((proj) => proj.id === project.id);
  const isViewer = currentProject?.role === "VIEWER";

  if (isViewer) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Header title="Base URL" />
          <div className="rounded-md bg-gray-50 p-4">
            {baseUrl ? `${baseUrl}/${project.id}/v1` : `/${project.id}/v1`}
          </div>
        </div>
      </div>
    );
  }

  const utils = api.useUtils();
  const router = useRouter();
  const setDefaultProject = api.projects.setDefault.useMutation({
    onSuccess: () => {
      void utils.projects.invalidate();
      toast.success("Project set as default", {
        description: "This project is now your default project",
      });
      router.replace(router.asPath);
    },
    onError: (error) => {
      toast.error("Error setting default project", {
        description: error.message,
      });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* <HostNameProject /> */}
      {project.isDefault === false && (
        <div>
          <Header title="Default Project" />
          <Button
            onClick={() => setDefaultProject.mutate({ projectId: project.id })}
            loading={setDefaultProject.isLoading}
          >
            Set as Default
          </Button>
        </div>
      )}
      <RenameProject />
      {showRetentionSettings && <ConfigureRetention />}
      <div>
        <Header title="Debug Information" />
        <JSONView
          title="Metadata"
          json={{
            project: { name: project.name, id: project.id },
            org: { name: organization.name, id: organization.id },
          }}
        />
      </div>
      <SettingsDangerZone
        items={[
          // {
          //   title: "Transfer ownership",
          //   description:
          //     "Transfer this project to another organization where you have the ability to create projects.",
          //   button: <TransferProjectButton />,
          // },
          {
            title: "Delete this project",
            description:
              "Once you delete a project, there is no going back. Please be certain.",
            button: <DeleteProjectButton />,
          },
        ]}
      />
    </div>
  );
}
