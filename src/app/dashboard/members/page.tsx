import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { users, organizationMembers, inviteTokens } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { MembersPanel } from "@/components/settings/members-panel";
import { InvitesPanel } from "@/components/settings/invites-panel";
import type { MemberRole } from "@/lib/get-org";

export default async function MembersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [rawMembers, activeInvites] = await Promise.all([
    db
      .select({
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        createdAt: organizationMembers.createdAt,
        name: users.name,
        email: users.email,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, ctx.org.id)),
    db.query.inviteTokens.findMany({
      where: and(
        eq(inviteTokens.organizationId, ctx.org.id),
        isNull(inviteTokens.usedAt),
        gt(inviteTokens.expiresAt, new Date()),
      ),
      columns: { tokenHash: false },
      with: { createdByUser: { columns: { name: true, email: true } } },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description={`${rawMembers.length} member${rawMembers.length !== 1 ? "s" : ""} in ${ctx.org.name}`}
      />

      <div className="grid grid-cols-1 gap-6 max-w-2xl">
        <div className="bg-card border border-border-base rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border-base">
            <h2 className="font-semibold text-white">Team</h2>
          </div>
          <div className="px-6 py-2">
            <MembersPanel
              members={rawMembers as Array<{ userId: string; name: string | null; email: string; role: MemberRole; createdAt: Date }>}
              currentUserId={ctx.userId}
              isAdmin={ctx.role === "admin"}
            />
          </div>
        </div>

        {ctx.role === "admin" && (
          <div className="bg-card border border-border-base rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-base">
              <h2 className="font-semibold text-white">Invite links</h2>
              <p className="text-xs text-th-subtle mt-0.5">One-time links · expire after 7 days</p>
            </div>
            <div className="px-6 py-4">
              <InvitesPanel initial={activeInvites as any} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
