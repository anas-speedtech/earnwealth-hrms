import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { compoffService } from '../../services/compoff.service';
import { holidayService } from '../../services/holiday.service';
import { leaveService } from '../../services/leave.service';
import { payrollService } from '../../services/payroll.service';
import { wfhService } from '../../services/wfh.service';

interface AppNotification {
  id: string;
  text: string;
  tone: 'blue' | 'green' | 'purple' | 'yellow' | 'red';
  createdAt: string;
}

const READ_KEY = 'ews_notifications_read';

function loadReadIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: string[]) {
  try {
    sessionStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable; notifications remain visible until reload
  }
}

export default function EmployeeNotificationsPage() {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    load()
      .then((result) => {
        if (mounted) setNotifications(result);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : (user?.email || 'Employee');

  const visible = notifications.filter((notification) => !readIds.has(notification.id));
  const readCount = notifications.length - visible.length;

  const markAllAsRead = () => {
    const ids = visible.map((notification) => notification.id);
    saveReadIds([...readIds, ...ids]);
    setReadIds(new Set([...readIds, ...ids]));
  };

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Notifications" subtitle="Updates derived from your live data" />
      <div className="p-8 max-w-4xl">
        {isLoading && <p className="text-slate-500">Loading notifications…</p>}

        {!isLoading && visible.length === 0 && readCount === 0 ? (
          <p className="text-slate-500">You have no notifications right now.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {visible.length} unread, {readCount} read
              </p>
              <button
                onClick={markAllAsRead}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Mark all as read
              </button>
            </div>
            {visible.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-xl border p-4 text-sm ${
                  notification.tone === 'green'
                    ? 'border-green-100 bg-green-50'
                    : notification.tone === 'yellow'
                      ? 'border-amber-100 bg-amber-50'
                      : notification.tone === 'purple'
                        ? 'border-purple-100 bg-purple-50'
                        : notification.tone === 'red'
                          ? 'border-red-100 bg-red-50'
                          : 'border-blue-100 bg-blue-50'
                }`}
              >
                {notification.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

// ---- derived notifications (computed from live endpoints) ----

async function load(): Promise<AppNotification[]> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [pendingLeaves, pendingWfhs, pendingCompOffCredits, hasPayslip, hasCompOff, nextHoliday] =
    await Promise.all([
      countPendingLeaves(),
      countPendingWfhs(),
      countPendingCompOffCredits(),
      hasCurrentMonthPayslip(currentMonth, currentYear),
      hasCompOffBalance(),
      nextUpcomingHoliday(now),
    ]);

  const result: AppNotification[] = [];

  if (pendingLeaves > 0) {
    result.push({
      id: 'pending-leaves',
      text: `${pendingLeaves} leave request${pendingLeaves === 1 ? '' : 's'} are still waiting for your review.`,
      tone: 'yellow',
      createdAt: now.toISOString(),
    });
  }
  if (pendingWfhs > 0) {
    result.push({
      id: 'pending-wfhs',
      text: `${pendingWfhs} WFH request${pendingWfhs === 1 ? '' : 's'} are still waiting for review.`,
      tone: 'yellow',
      createdAt: now.toISOString(),
    });
  }
  if (pendingCompOffCredits > 0) {
    result.push({
      id: 'pending-compoff',
      text: `${pendingCompOffCredits} comp-off review${pendingCompOffCredits === 1 ? '' : 's'} is still pending.`,
      tone: 'yellow',
      createdAt: now.toISOString(),
    });
  }
  if (hasPayslip) {
    result.push({
      id: 'payslip-current-month',
      text: `Your payslip for ${currentMonth}/${currentYear} is available.`,
      tone: 'green',
      createdAt: now.toISOString(),
    });
  }
  if (hasCompOff) {
    result.push({
      id: 'compoff-balance',
      text: 'You still have comp-off days available.',
      tone: 'purple',
      createdAt: now.toISOString(),
    });
  }
  if (nextHoliday) {
    result.push({
      id: 'next-holiday',
      text: `Next holiday: ${nextHoliday.name} on ${nextHoliday.date}.`,
      tone: 'blue',
      createdAt: now.toISOString(),
    });
  }

  return result;
}

async function countPendingLeaves(): Promise<number> {
  try {
    const requests = await leaveService.getPendingRequests();
    return requests.filter((request) => request.status === 'PENDING').length;
  } catch {
    return 0;
  }
}

async function countPendingWfhs(): Promise<number> {
  try {
    const requests = await wfhService.listPending();
    return requests.filter((request) => request.status === 'PENDING').length;
  } catch {
    return 0;
  }
}

async function countPendingCompOffCredits(): Promise<number> {
  try {
    const credits = await compoffService.listPendingCredits();
    return credits.filter((credit) => credit.status === 'PENDING').length;
  } catch {
    return 0;
  }
}

async function hasCurrentMonthPayslip(month: number, year: number): Promise<boolean> {
  try {
    const response = await payrollService.listMyPayslips();
    const payslips = response.payslips ?? [];
    return payslips.some((payslip) => payslip.month === month && payslip.year === year);
  } catch {
    return false;
  }
}

async function hasCompOffBalance(): Promise<boolean> {
  try {
    const balance = await compoffService.getMyBalance();
    return balance.available > 0;
  } catch {
    return false;
  }
}

async function nextUpcomingHoliday(now: Date): Promise<{ name: string; date: string } | null> {
  try {
    const holidays = await holidayService.list();
    const upcoming = holidays
      .map((holiday) => ({ holiday, date: new Date(holiday.date) }))
      .filter((entry) => entry.date.getTime() >= now.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const next = upcoming[0];
    return next ? { name: next.holiday.name, date: next.holiday.date } : null;
  } catch {
    return null;
  }
}
