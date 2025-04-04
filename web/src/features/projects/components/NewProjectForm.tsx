import { Button } from "@/src/components/ui/button";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { chatRunTrigger } from "@/src/features/support-chat/chat";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Checkbox } from "@/src/components/ui/checkbox";
import { api } from "@/src/utils/api";
import { Role } from "@prisma/client";

export const NewProjectForm = ({
  orgId,
  onSuccess,
  wizardMode = false,
}: {
  orgId: string;
  onSuccess: (projectId: string) => void;
  wizardMode?: boolean;
}) => {
  const { data: hasDefaultProject } = api.projects.hasDefault.useQuery(
    {
      orgId,
    },
    {
      enabled: !!orgId,
    },
  );
  const capture = usePostHogClientCapture();
  const { data: session, update: updateSession } = useSession();

  const form = useForm<
    z.infer<typeof projectNameSchema> & { isDefault: boolean }
  >({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
      isDefault: wizardMode,
    },
  });
  const router = useRouter();
  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: (newProject) => {
      void updateSession();
      void router.push(`/project/${newProject.id}/settings`);
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  async function onSubmit(
    values: z.infer<typeof projectNameSchema> & { isDefault: boolean },
  ) {
    capture("projects:new_form_submit");
    try {
      const project = await createProjectMutation.mutateAsync({
        name: values.name,
        orgId,
        isDefault: values.isDefault,
        wizardMode,
      });

      if (wizardMode) {
        // Memberships are handled by the setup wizard flow
        values.isDefault = true;
      }

      onSuccess(project.id);
      form.reset();
    } catch (error) {
      console.error(error);
    }
    chatRunTrigger("after-project-creation");
  }
  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        data-testid="new-project-form"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project name</FormLabel>
              <FormControl>
                <Input
                  placeholder="my-llm-project"
                  {...field}
                  data-testid="new-project-name-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {!hasDefaultProject && !wizardMode && (
          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Set as default project</FormLabel>
                </div>
              </FormItem>
            )}
          />
        )}
        <Button type="submit" loading={createProjectMutation.isLoading}>
          Create
        </Button>
      </form>
    </Form>
  );
};
