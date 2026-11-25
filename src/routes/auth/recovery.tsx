import { createFileRoute } from "@tanstack/react-router";
import PasswordRecovery from "@/features/auth/components/PasswordRecovery";

export const Route = createFileRoute("/auth/recovery")({
  component: PasswordRecovery,
});
