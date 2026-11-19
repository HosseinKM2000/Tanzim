import { createFileRoute } from "@tanstack/react-router";
import { LegalStatusPage } from "@/features/auth/components/LegalStatusPage";

export const Route = createFileRoute("/legal/privacy")({
  component: () => <LegalStatusPage kind="privacy" />,
});
