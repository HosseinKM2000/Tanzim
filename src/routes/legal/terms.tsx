import { createFileRoute } from "@tanstack/react-router";
import { LegalStatusPage } from "@/features/auth/components/LegalStatusPage";

export const Route = createFileRoute("/legal/terms")({
  component: () => <LegalStatusPage kind="terms" />,
});
