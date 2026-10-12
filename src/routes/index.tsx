import { createFileRoute } from "@tanstack/react-router";
import { OpportunityRadar } from "@/components/opportunity-radar";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <OpportunityRadar />;
}
