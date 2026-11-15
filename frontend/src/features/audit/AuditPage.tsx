import { Bell, Download, Lock, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { Badge, Card, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { useAudit, useNotifications, useUsers } from "@/hooks/queries";
import type { Tone } from "@/lib/semantic";
import { fmtDateTime } from "@/lib/utils";

function actionTone(action: string): Tone {
  if (action.includes("OVERRIDE")) return "violet";
  if (action.includes("REALLOCATION") || action.includes("STATUS_CHANGE")) return "warn";
  if (action.includes("APPROVED") || action.includes("CHECK_IN") || action.includes("ARRIVAL")) return "ok";
  if (action.startsWith("DRILL")) return "info";
  return "neutral";
}

export function AuditPage() {
  return (
    <div>
      <PageHeader icon={ScrollText} title="Audit Log & Notifications" description="Append-only record of every decision, override and status change (FR-12). Read-only." />
      <div className="p-4 sm:p-6">
        <Tabs defaultValue="audit">
          <TabsList aria-label="Log type">
            <TabsTrigger value="audit">
              <ScrollText /> Audit log
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell /> Notifications
            </TabsTrigger>
          </TabsList>
          <TabsContent value="audit" className="mt-4">
            <AuditTable />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationsTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AuditTable() {
  const { data, isLoading, error, refetch } = useAudit();
  const { data: users } = useUsers();
  const [action, setAction] = useState("all");
  const [user, setUser] = useState("all");
  const [q, setQ] = useState("");
  const userName = (id: number | null) => (id == null ? "SafeRoute Engine" : (users?.find((u) => u.user_id === id)?.name ?? `User #${id}`));
  const actions = useMemo(() => [...new Set((data ?? []).map((l) => l.action))].sort(), [data]);
  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((l) => (action === "all" ? true : l.action === action))
        .filter((l) => (user === "all" ? true : String(l.user_id ?? "system") === user))
        .filter((l) => `${l.action} ${l.details ?? ""} ${l.entity_type ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [data, action, user, q],
  );

  const exportCsv = () => {
    const header = ["log_id", "timestamp", "user", "action", "entity_type", "entity_id", "details"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((l) => [l.log_id, l.timestamp, userName(l.user_id), l.action, l.entity_type, l.entity_id, l.details].map(esc).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "saferoute-audit-log.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Input aria-label="Search audit log" placeholder="Search details…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <Select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="w-56">
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Select aria-label="Filter by user" value={user} onChange={(e) => setUser(e.target.value)} className="w-52">
          <option value="all">All users</option>
          <option value="system">SafeRoute Engine</option>
          {users?.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Badge tone="neutral" className="ml-auto">
          <Lock /> Append-only
        </Badge>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download /> CSV
        </Button>
      </div>
      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No audit entries match" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Details</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((l) => (
              <TR key={l.log_id} data-testid="audit-row">
                <TD className="whitespace-nowrap text-xs text-muted">{fmtDateTime(l.timestamp)}</TD>
                <TD className="whitespace-nowrap text-sm">{userName(l.user_id)}</TD>
                <TD>
                  <Badge tone={actionTone(l.action)} className="font-mono">
                    {l.action}
                  </Badge>
                </TD>
                <TD className="whitespace-nowrap text-xs text-muted">{l.entity_type ? `${l.entity_type}${l.entity_id != null ? ` #${l.entity_id}` : ""}` : "—"}</TD>
                <TD className="min-w-80 text-sm">{l.details}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function NotificationsTable() {
  const { data, isLoading, error } = useNotifications();
  const [type, setType] = useState("all");
  const rows = (data ?? []).filter((n) => (type === "all" ? true : n.type === type));
  const tone = (t: string): Tone => (t === "CRITICAL" ? "danger" : t === "WARNING" || t === "ALERT" ? "warn" : "info");
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-40">
          <option value="all">All types</option>
          {["CRITICAL", "ALERT", "WARNING", "INFO"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-muted">{rows.length} notifications</span>
      </div>
      {isLoading ? (
        <TableSkeleton cols={3} />
      ) : error ? (
        <ErrorState error={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No notifications" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Type</TH>
              <TH>Message</TH>
              <TH>Read</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((n) => (
              <TR key={n.notification_id}>
                <TD className="whitespace-nowrap text-xs text-muted">{fmtDateTime(n.timestamp)}</TD>
                <TD>
                  <Badge tone={tone(n.type)}>{n.type}</Badge>
                </TD>
                <TD className="text-sm">{n.message}</TD>
                <TD className="text-xs text-muted">{n.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
