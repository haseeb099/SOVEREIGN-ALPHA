import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/terminal(.*)",
  "/compare(.*)",
  "/community(.*)",
  "/reports(.*)",
  "/pricing(.*)",
  "/terms(.*)",
  "/privacy(.*)",
  "/enterprise(.*)",
  "/security(.*)",
  "/waitlist(.*)",
  "/blog(.*)",
  "/case-studies(.*)",
  "/beta(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/portfolio(.*)",
  "/library(.*)",
  "/settings(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});
