import { ErrorScaffold } from "@/components/ErrorScaffold";

export default function NotFound() {
  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="404 · Spilled"
      title="Nothing poured at this address."
      body={
        <>
          The page you were after doesn&apos;t exist or moved. Head back to the
          game — the round is still fresh.
        </>
      }
      primary={{ href: "/dunk", label: "Back to the game" }}
      secondary={{ href: "/wallet", label: "Open wallet" }}
    />
  );
}
