import { LoadingScreen } from "@/components/dashboard/loading-screen";

// Next.js's own route-level loading convention — automatically wraps
// every page under /dashboard in a Suspense boundary, shown while that
// page's own Server Component is still resolving (covers a hard
// navigation and the very first render; most pages here stream their own
// heavy content in via their own inner <Suspense>/skeleton once their
// shell has rendered, so this screen is typically brief — but it's the
// one thing visible before even that shell exists, replacing a generic
// skeleton with the branded logo animation per the user's own request.
export default function Loading() {
  return <LoadingScreen />;
}
