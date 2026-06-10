// This route group layout is a pass-through
// Real dashboard layout is at /src/app/dashboard/layout.tsx
export default function GroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
