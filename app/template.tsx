/**
 * App Router 模板：在子路由切换时重新挂载，用于平滑入场过渡。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
