import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * /api/eval/run：评测平台服务端用 Bearer EVAL_SERVER_SECRET 调用，无 Clerk Cookie；
 * 必须在公开路由中放行，否则 Clerk 会 protect 导致 404/重定向。鉴权在 route.ts 内完成。
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/settings(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/eval/run",
]);

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  // 静态景观图（public/landing）与 Next 内部资源必须直通
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/__clerk") ||
    pathname.startsWith("/landing/")
  ) {
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
