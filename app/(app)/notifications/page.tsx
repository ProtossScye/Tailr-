import Link from "next/link";
import { BellArt, ChevronLeftIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div className="page">
      <div>
        <Link href="/dashboard" className="link-more" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ChevronLeftIcon style={{ width: 18, height: 18 }} /> Home
        </Link>
      </div>
      <header>
        <h1 className="page-title">Notifications</h1>
        <p className="page-sub">Settlement updates, slip status, account notices and announcements.</p>
      </header>
      <EmptyState art={<BellArt className="empty-art" />} title="You are all caught up">
        Tailr does not send notifications yet. Bets are settled by you, and slips and bookmaker imports are not available, so there is nothing to
        report. When those arrive, updates will be listed here.
      </EmptyState>
    </div>
  );
}
