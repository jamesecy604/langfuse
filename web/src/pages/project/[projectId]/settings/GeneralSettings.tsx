import { HostNameProject } from "@/src/features/projects/components/HostNameProject";
import RenameProject from "@/src/features/projects/components/RenameProject";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { TransferProjectButton } from "@/src/features/projects/components/TransferProjectButton";
import { DeleteProjectButton } from "@/src/features/projects/components/DeleteProjectButton";
import Header from "@/src/components/layouts/header";
import ConfigureRetention from "@/src/features/projects/components/ConfigureRetention";
import { useSession } from "next-auth/react";

export function GeneralSettings({
  baseUrl,
  project,
  organization,
  showRetentionSettings,
}: {
  project: { id: string; name: string };
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

  return (
    <div className="flex flex-col gap-6">
      {/* <HostNameProject /> */}
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
