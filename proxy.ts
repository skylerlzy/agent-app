import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  // Next 静态资源与 Clerk 内部请求必须直通，避免误触发 auth 导致 chunk/css 404 或 ERR_ABORTED
  if (pathname.startsWith("/_next/") || pathname.startsWith("/__clerk")) {
    return NextResponse.next();
  }

  // 浏览器默认请求 /favicon.ico；重定向到 app/icon.tsx 生成的 /icon
  if (pathname === "/favicon.ico") {
    return NextResponse.redirect(new URL("/icon", request.url));
  }

  if (pathname === "/icon" || pathname === "/apple-icon") {
    return NextResponse.next();
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
