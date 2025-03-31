import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { Checkbox } from "@/src/components/ui/checkbox";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { LockIcon } from "lucide-react";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export default function RenameProject() {
  const { update: updateSession } = useSession();
  const { project } = useQueryProject();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:update",
  });

  const form = useForm<
    z.infer<typeof projectNameSchema> & { isDefault: boolean }
  >({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
      isDefault: project?.isDefault ?? false,
    },
  });
  const renameProject = api.projects.update.useMutation({
    onSuccess: (_) => {
      void updateSession();
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    if (!hasAccess || !project) return;
    capture("project_settings:rename_form_submit");
    if (!values.name || values.name === project?.name) return;
    renameProject
      .mutateAsync({
        projectId: project.id,
        newName: values.name,
        isDefault: values.isDefault,
      })
      .then(() => {
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <div>
      <Header title="Project Name" />
      <Card className="mb-4 p-3">
        {form.getValues().name !== "" ? (
          <p className="mb-4 text-sm text-primary">
            Your Project will be renamed from "{project?.name ?? ""}" to "
            <b>{form.watch().name}</b>".
          </p>
        ) : (
          <p className="mb-4 text-sm text-primary">
            Your Project is currently named "<b>{project?.name ?? ""}</b>
            ".
          </p>
        )}
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1"
            id="rename-project-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder={project?.name ?? ""}
                        {...field}
                        className="flex-1"
                        disabled={!hasAccess}
                      />
                      {!hasAccess && (
                        <span title="No access">
                          <LockIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted" />
                        </span>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {hasAccess && (
              <>
                <FormField
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <FormItem className="mt-4 flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!hasAccess || !project?.isDefault}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <label className="text-sm font-medium leading-none">
                          Default Project
                        </label>
                        <p className="text-sm text-muted-foreground">
                          {project?.isDefault
                            ? "Uncheck to remove default status"
                            : "Only default projects can change this setting"}
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
                <Button
                  variant="secondary"
                  type="submit"
                  loading={renameProject.isLoading}
                  disabled={
                    !(
                      (form.getValues().name !== "" ||
                        (form.getValues().isDefault !== project?.isDefault &&
                          form.getValues().name !== "")) &&
                      hasAccess
                    )
                  }
                  className="mt-6"
                >
                  Save
                </Button>
              </>
            )}
          </form>
        </Form>
      </Card>
    </div>
  );
}
