/**
 * Analytics page with an intentional intermittent crash bug.
 *
 * BUG: When dataset > 50k rows, changing date filter then quickly changing
 * country filter while data is still loading causes a race condition crash.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { apiFetch } from "../lib/auth";

interface AnalyticsData {
  chartData: { label: string; revenue: number; users: number }[];
  summary: { totalRevenue: number; totalUsers: number; totalOrders: number };
  rowCount: number;
  isLargeDataset: boolean;
}

const DATE_RANGES = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "1y", label: "Last Year" },
];

const COUNTRIES = ["All", "US", "IN", "UK", "DE", "FR", "JP", "AU", "CA"];

export default function Analytics() {
  const [dateRange, setDateRange] = useState("7d");
  const [country, setCountry] = useState("All");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [crashMessage, setCrashMessage] = useState("");
  const requestIdRef = useRef(0);
  const pendingFiltersRef = useRef<{ dateRange: string; country: string } | null>(null);
  const isLargeDatasetRef = useRef(typeof localStorage !== "undefined" && localStorage.getItem("bb_large_dataset") === "1");

  const fetchData = useCallback(async (range: string, countryFilter: string) => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    pendingFiltersRef.current = { dateRange: range, country: countryFilter };

    try {
      // Simulate slow data processing for large datasets
      const delay = isLargeDatasetRef.current ? 800 + Math.random() * 1200 : 200;
      await new Promise((r) => setTimeout(r, delay));

      const res = await apiFetch(
        `/analytics?dateRange=${range}&country=${countryFilter === "All" ? "" : countryFilter}`
      );

      // BUG: Race condition — if filters changed while loading, stale response corrupts state
      if (reqId !== requestIdRef.current) {
        // Stale request — but we still process it (the bug!)
        const staleData = await res.json();
        if (isLargeDatasetRef.current && pendingFiltersRef.current) {
          const current = pendingFiltersRef.current;
          // This throws when dateRange from stale doesn't match what UI expects
          const mismatch = staleData.filters.dateRange !== current.dateRange;
          const large = staleData.rowCount > 50000 || localStorage.getItem("bb_large_dataset") === "1";
          if (mismatch && large) {
            throw new TypeError(
              `Cannot read properties of undefined (reading 'chartData') — stale filter state: expected ${current.dateRange}, got ${staleData.filters?.dateRange}`
            );
          }
        }
        return;
      }

      const result = await res.json();
      const forcedLarge = localStorage.getItem("bb_large_dataset") === "1";
      result.isLargeDataset = result.isLargeDataset || forcedLarge;
      result.rowCount = Math.max(result.rowCount ?? 0, forcedLarge ? 213000 : 0);
      isLargeDatasetRef.current = result.isLargeDataset;
      setData(result);
      setLoading(false);
      pendingFiltersRef.current = null;
    } catch (err) {
      if (reqId === requestIdRef.current || isLargeDatasetRef.current) {
        setCrashed(true);
        setCrashMessage(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
        console.error("[Analytics] Dashboard crashed:", err);
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    fetchData(dateRange, country).catch(() => {});
  }, []);

  const handleDateChange = (value: string) => {
    setDateRange(value);
    fetchData(value, country).catch(() => {});
  };

  const handleCountryChange = (value: string) => {
    setCountry(value);
    // BUG TRIGGER: rapid country change while date filter is still loading
    fetchData(dateRange, value).catch(() => {});
  };

  if (crashed) {
    return (
      <div className="flex h-full items-center justify-center p-8" data-testid="crash-screen">
        <div className="max-w-md rounded-xl border border-red-900/50 bg-red-950/30 p-8 text-center">
          <div className="mb-4 text-4xl">💥</div>
          <h2 className="text-xl font-bold text-red-400">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-300/80">The analytics dashboard crashed unexpectedly.</p>
          <p className="mt-4 rounded-lg bg-red-950/50 p-3 font-mono text-xs text-red-400">{crashMessage}</p>
          <button
            onClick={() => { setCrashed(false); setData(null); fetchData(dateRange, country).catch(() => {}); }}
            className="mt-6 rounded-lg bg-red-600 px-4 py-2 text-sm hover:bg-red-500"
          >
            Try refreshing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-slate-400">Revenue and user metrics across your data.</p>
        </div>
        {loading && (
          <span className="rounded-full bg-amber-900/30 px-3 py-1 text-xs text-amber-300" data-testid="loading-indicator">
            Loading data...
          </span>
        )}
      </header>

      <div className="mb-6 flex gap-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Date Range</label>
          <select
            value={dateRange}
            onChange={(e) => handleDateChange(e.target.value)}
            data-testid="date-filter"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Country</label>
          <select
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            data-testid="country-filter"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">Total Revenue</p>
              <p className="text-xl font-bold">${data.summary.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">Total Users</p>
              <p className="text-xl font-bold">{data.summary.totalUsers.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-sm text-slate-500">Total Orders</p>
              <p className="text-xl font-bold">{data.summary.totalOrders.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-4 text-sm font-medium text-slate-400">Revenue by Period</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chartData}>
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155" }} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-4 text-sm font-medium text-slate-400">Users Over Time</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.chartData}>
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155" }} />
                  <Line type="monotone" dataKey="users" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
          Upload a CSV dataset in Projects to see analytics.
        </div>
      )}
    </div>
  );
}
