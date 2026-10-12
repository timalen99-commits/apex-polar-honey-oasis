import { createFileRoute } from "@tanstack/react-router";
import { RelayDesk } from "@/components/relay-desk";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <RelayDesk />;
}
