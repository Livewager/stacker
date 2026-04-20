import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

export default function NotFound() {
  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="404 · Spilled"
      title="Nothing poured at this address."
      body={
        <>
          The page you were after doesn&apos;t exist or moved. Head to the games
          hub — Tilt Pour and Stacker are both one tap away.
        </>
      }
      primary={{ href: ROUTES.play, label: "Games hub" }}
      secondary={{ href: ROUTES.wallet, label: "Open wallet" }}
    />
  );
}
