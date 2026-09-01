import bcrypt from "bcryptjs";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  rowCount: number;
  createdAt: string;
}

export interface DataRow {
  projectId: string;
  date: string;
  country: string;
  revenue: number;
  users: number;
  orders: number;
}

const users = new Map<string, User>();
const usersByEmail = new Map<string, User>();
const projects = new Map<string, Project>();
const rows: DataRow[] = [];

function seedDemoUser() {
  if (usersByEmail.has("demo@buggyboard.io")) return;
  const user: User = {
    id: "user_demo",
    email: "demo@buggyboard.io",
    passwordHash: bcrypt.hashSync("demo1234", 8),
    name: "Demo User",
  };
  users.set(user.id, user);
  usersByEmail.set(user.email, user);
}

seedDemoUser();

export const store = {
  getUserByEmail(email: string) {
    return usersByEmail.get(email);
  },
  getUserById(id: string) {
    return users.get(id);
  },
  listProjects(userId: string) {
    return [...projects.values()]
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  createProject(userId: string, name: string) {
    const project: Project = {
      id: `proj_${Date.now()}`,
      userId,
      name,
      rowCount: 0,
      createdAt: new Date().toISOString(),
    };
    projects.set(project.id, project);
    return project;
  },
  getProject(id: string) {
    return projects.get(id);
  },
  replaceRows(projectId: string, next: DataRow[], rowCount: number) {
    const project = projects.get(projectId);
    if (!project) return;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].projectId === projectId) rows.splice(i, 1);
    }
    rows.push(...next);
    project.rowCount = rowCount;
  },
  stats(userId: string) {
    const userProjects = this.listProjects(userId);
    return {
      projects: userProjects.length,
      totalRows: userProjects.reduce((s, p) => s + p.rowCount, 0),
      lastUpload: userProjects[0]?.createdAt ?? null,
    };
  },
  analytics(userId: string, dateRange: string, country: string) {
    const userProjects = this.listProjects(userId);
    const totalRows = userProjects.reduce((s, p) => s + p.rowCount, 0);
    const ids = new Set(userProjects.map((p) => p.id));
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const grouped = new Map<string, { revenue: number; users: number; orders: number }>();
    for (const row of rows) {
      if (!ids.has(row.projectId)) continue;
      if (country && row.country !== country) continue;
      if (row.date < cutoffStr) continue;
      const cur = grouped.get(row.date) ?? { revenue: 0, users: 0, orders: 0 };
      cur.revenue += row.revenue;
      cur.users += row.users;
      cur.orders += row.orders;
      grouped.set(row.date, cur);
    }

    const sorted = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    const chartData = sorted.slice(-12).map(([date, v]) => ({
      label: date.slice(5),
      revenue: Math.round(v.revenue),
      users: v.users,
    }));
    const summary = {
      totalRevenue: Math.round(sorted.reduce((s, [, v]) => s + v.revenue, 0)),
      totalUsers: sorted.reduce((s, [, v]) => s + v.users, 0),
      totalOrders: sorted.reduce((s, [, v]) => s + v.orders, 0),
    };

    return {
      chartData,
      summary,
      rowCount: totalRows,
      isLargeDataset: totalRows > 50000,
      filters: { dateRange, country: country || "All" },
    };
  },
};

export function buildSyntheticRows(projectId: string): DataRow[] {
  const countries = ["US", "IN", "UK", "DE", "FR", "JP", "AU", "CA"];
  const out: DataRow[] = [];
  for (let i = 0; i < 90; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    for (const country of countries) {
      out.push({
        projectId,
        date: dateStr,
        country,
        revenue: 800 + ((i * 37 + country.length * 13) % 4000),
        users: 40 + ((i * 11 + country.length) % 200),
        orders: 5 + ((i * 3 + country.length) % 40),
      });
    }
  }
  return out;
}
