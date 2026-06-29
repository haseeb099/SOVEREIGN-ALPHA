import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

const clerkHandlerPromise = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? import("./middleware-clerk").then((m) => m.default)
  : null;

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkHandlerPromise) {
    return NextResponse.next();
  }
  const handler = await clerkHandlerPromise;
  return handler(req, event);
}
