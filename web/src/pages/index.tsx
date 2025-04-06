import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { OrganizationProjectOverview } from "@/src/features/organizations/components/ProjectOverview";

interface Project {
  id: string;
  name: string;
  role: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session.user) {
      const project = session.user.organizations?.[0]?.projects?.[0] as
        | Project
        | undefined;

      if (project?.role === "VIEWER") {
        router.push(`/project/${project.id}/settings`);
        return; // Prevent rendering the component
      }
    }
  }, [status, session, router]);

  // Show OrganizationProjectOverview for non-viewers or when no redirect occurs
  return <OrganizationProjectOverview />;
}
