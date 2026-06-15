"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { executeSQL, getDatabase, clearDatabase, seedDatabase, Database } from "@/app/lib/pgSimulator";
import SqlDocs from "@/app/components/SqlDocs";

interface HistoryEntry {
  sql: string;
  result: {
    success: boolean;
    message: string;
    rows?: Record<string, unknown>[];
    rowCount?: number;
    command?: string;
  };
  timestamp: string;
}

interface TablePanel {
  id: string;
  tableName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const SNIPPET_GROUPS = [
  {
    label: "Table",
    color: "blue",
    snippets: [
      {
        label: "CREATE TABLE",
        sql: `CREATE TABLE orders (\n  id SERIAL PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  total NUMERIC,\n  status VARCHAR\n);`,
      },
      { label: "DROP TABLE", sql: `DROP TABLE orders;` },
      { label: "TRUNCATE", sql: `TRUNCATE TABLE products;` },
      { label: "ALTER ADD", sql: `ALTER TABLE users ADD COLUMN phone VARCHAR;` },
      { label: "ALTER DROP", sql: `ALTER TABLE users DROP COLUMN phone;` },
    ],
  },
  {
    label: "DML",
    color: "green",
    snippets: [
      {
        label: "INSERT",
        sql: `INSERT INTO users (name, email, age)\nVALUES ('David Lee', 'david@example.com', 30);`,
      },
      { label: "SELECT *", sql: `SELECT * FROM users;` },
      { label: "SELECT WHERE", sql: `SELECT * FROM users WHERE age > 25;` },
      { label: "SELECT LIKE", sql: `SELECT * FROM users WHERE name LIKE '%Alice%';` },
      { label: "SELECT ORDER", sql: `SELECT * FROM products ORDER BY price DESC LIMIT 3;` },
      {
        label: "JOIN orders",
        sql: `SELECT u.id, u.name, o.id AS order_id, o.total, o.status\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id;`,
      },
      {
        label: "JOIN reviews",
        sql: `SELECT u.id, u.name, r.product_id, r.rating, r.comment\nFROM users u\nLEFT JOIN reviews r ON u.id = r.user_id;`,
      },
      {
        label: "JOIN addresses",
        sql: `SELECT u.id, u.name, a.street, a.city, a.country\nFROM users u\nLEFT JOIN addresses a ON u.id = a.user_id;`,
      },
      { label: "UPDATE", sql: `UPDATE users SET age = 99 WHERE name = 'Alice Smith';` },
      { label: "DELETE", sql: `DELETE FROM users WHERE id = 3;` },
    ],
  },
  {
    label: "Inspect",
    color: "purple",
    snippets: [
      { label: "\\dt (tables)", sql: `\\dt` },
      { label: "\\d users", sql: `\\d users` },
      { label: "\\d orders", sql: `\\d orders` },
      { label: "\\d reviews", sql: `\\d reviews` },
      { label: "\\d addresses", sql: `\\d addresses` },
      { label: "SELECT users", sql: `SELECT * FROM users;` },
      { label: "SELECT orders", sql: `SELECT * FROM orders;` },
      { label: "SELECT reviews", sql: `SELECT * FROM reviews;` },
      { label: "SELECT addresses", sql: `SELECT * FROM addresses;` },
    ],
  },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-950 text-blue-300 hover:bg-blue-900 border-blue-800",
  green: "bg-green-950 text-green-300 hover:bg-green-900 border-green-800",
  purple: "bg-purple-950 text-purple-300 hover:bg-purple-900 border-purple-800",
};

// ─── Inline Data Grid ────────────────────────────────────────────────────────

function DataGrid({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-gray-600 text-xs italic p-4">No rows returned.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-800">
            <th className="px-2 py-1.5 text-gray-600 border border-gray-700 text-right w-8 font-normal select-none">
              #
            </th>
            {cols.map((col) => (
              <th
                key={col}
                className="px-3 py-1.5 text-left text-blue-300 border border-gray-700 font-semibold whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`${i % 2 === 0 ? "bg-gray-950" : "bg-gray-900"} hover:bg-gray-800 transition-colors`}>
              <td className="px-2 py-1 text-gray-700 border border-gray-800 text-right select-none">{i + 1}</td>
              {cols.map((col, j) => {
                const val = row[col];
                return (
                  <td key={j} className="px-3 py-1 border border-gray-800 whitespace-nowrap">
                    {val === null || val === undefined ? (
                      <span className="text-gray-600 italic">NULL</span>
                    ) : typeof val === "number" || (typeof val === "string" && val !== "" && !isNaN(Number(val))) ? (
                      <span className="text-amber-300">{String(val)}</span>
                    ) : (
                      <span className="text-gray-300">{String(val)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PgSimulator() {
  const [sql, setSql] = useState("SELECT * FROM users;");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [db, setDb] = useState<Database>({ tables: {} });
  const [activeTab, setActiveTab] = useState<"result" | "history" | "schema">("result");
  const [isLoaded, setIsLoaded] = useState(false);
  const [view, setView] = useState<"query" | "docs">("query");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openPanels, setOpenPanels] = useState<TablePanel[]>([]);
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string; edge: "right" | "bottom" | "corner";
    startX: number; startY: number; startW: number; startH: number;
  } | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const refreshDB = useCallback(() => setDb(getDatabase()), []);

  useEffect(() => {
    const raw = localStorage.getItem("pg_simulator_db");
    if (!raw) seedDatabase();
    refreshDB();
    setIsLoaded(true);
  }, [refreshDB]);

  useEffect(() => {
    if (activeTab === "history") historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, activeTab]);

  // Document-level drag tracking — works even when mouse leaves the element
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setOpenPanels((prev) =>
        prev.map((p) => (p.id === dragging.id ? { ...p, x: e.clientX - dragging.ox, y: e.clientY - dragging.oy } : p))
      );
    };
    const onUp = () => setDragging(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // Document-level resize tracking
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      setOpenPanels((prev) =>
        prev.map((p) => {
          if (p.id !== resizing.id) return p;
          const newW = resizing.edge !== "bottom" ? Math.max(300, resizing.startW + dx) : p.width;
          const newH = resizing.edge !== "right" ? Math.max(140, resizing.startH + dy) : p.height;
          return { ...p, width: newW, height: newH };
        })
      );
    };
    const onUp = () => setResizing(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  function handleRun() {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const newEntries: HistoryEntry[] = [];
    for (const stmt of statements) {
      const result = executeSQL(stmt + (stmt.startsWith("\\") ? "" : ";"));
      newEntries.push({ sql: stmt, result, timestamp: new Date().toLocaleTimeString() });
    }
    setHistory((h) => [...h, ...newEntries]);
    setActiveTab("result");
    refreshDB();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setSql(sql.substring(0, start) + "  " + sql.substring(end));
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      }, 0);
    }
  }

  function openTablePanel(tableName: string) {
    const existing = openPanels.find((p) => p.tableName === tableName);
    if (existing) {
      // Bring to front
      setOpenPanels((prev) => [...prev.filter((p) => p.id !== existing.id), existing]);
      return;
    }
    const cascade = openPanels.length % 6;
    setOpenPanels((prev) => [
      ...prev,
      { id: `${tableName}-${Date.now()}`, tableName, x: 252 + cascade * 28, y: 72 + cascade * 28, width: 480, height: 280 },
    ]);
  }

  function closePanel(id: string) {
    setOpenPanels((prev) => prev.filter((p) => p.id !== id));
  }

  function bringToFront(id: string) {
    setOpenPanels((prev) => {
      const panel = prev.find((p) => p.id === id);
      if (!panel) return prev;
      return [...prev.filter((p) => p.id !== id), panel];
    });
  }

  function handleUseQuery(querySql: string) {
    setSql(querySql);
    setView("query");
  }

  const lastEntry = history[history.length - 1];
  const tableNames = Object.keys(db.tables);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-green-400 font-mono text-lg animate-pulse">Loading simulator…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-base leading-none"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            ☰
          </button>
          <Image src="/logo.png" alt="PG Simulator" width={28} height={28} className="rounded shrink-0" />
          <span className="text-green-400 font-bold text-xs sm:text-sm whitespace-nowrap">
            <span className="hidden sm:inline">PostgreSQL </span>Simulator
          </span>
          <span className="hidden lg:inline text-gray-600 text-xs">localhost:5432/simdb</span>
        </div>

        <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
          {(["query", "docs"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 sm:px-3 py-1 text-xs rounded transition-colors font-semibold uppercase tracking-wide ${
                view === v ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {v === "query" ? "Query" : "Docs"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline text-xs text-gray-600">{tableNames.length} table(s)</span>
          <button
            onClick={() => { seedDatabase(); refreshDB(); setHistory([]); setOpenPanels([]); }}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-yellow-400 border border-gray-600 whitespace-nowrap"
          >
            <span className="hidden sm:inline">Seed DB</span>
            <span className="sm:hidden">Seed</span>
          </button>
          <button
            onClick={() => { clearDatabase(); refreshDB(); setHistory([]); setOpenPanels([]); }}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-red-400 border border-gray-600 whitespace-nowrap"
          >
            <span className="hidden sm:inline">Clear DB</span>
            <span className="sm:hidden">Clear</span>
          </button>
        </div>
      </header>

      {/* ── DOCS VIEW ─────────────────────────────────────────────────────── */}
      {view === "docs" && <SqlDocs onUseQuery={handleUseQuery} />}

      {/* ── QUERY VIEW ────────────────────────────────────────────────────── */}
      {view === "query" && (
        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/60 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar — slide-over on mobile, static on desktop */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-52 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden transition-transform duration-200
              md:relative md:translate-x-0 md:z-auto md:shrink-0
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
          >
            {/* Close button — mobile only */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 md:hidden">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Menu</span>
              <button
                className="text-gray-500 hover:text-gray-200 text-xl leading-none"
                onClick={() => setSidebarOpen(false)}
              >
                ×
              </button>
            </div>
            {/* Tables section */}
            <div className="shrink-0">
              <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 flex items-center justify-between">
                <span>Tables</span>
                <span className="text-gray-600">{tableNames.length}</span>
              </div>
              <div className="py-1">
                {tableNames.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-600 italic">No tables. Click Seed DB.</p>
                ) : (
                  tableNames.map((t) => {
                    const isOpen = openPanels.some((p) => p.tableName === t);
                    return (
                      <button
                        key={t}
                        onClick={() => { openTablePanel(t); setSidebarOpen(false); }}
                        title={`Open ${t} data grid`}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between group transition-colors ${
                          isOpen
                            ? "bg-green-950 text-green-300 hover:bg-green-900"
                            : "text-gray-300 hover:bg-gray-800 hover:text-white"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span>{isOpen ? "🟢" : "📋"}</span>
                          <span className="truncate">{t}</span>
                        </span>
                        <span className="text-gray-600 text-xs ml-1 shrink-0 group-hover:text-gray-400">
                          ({db.tables[t].rows.length})
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Snippets */}
            <div className="border-t border-gray-800 flex-1 overflow-y-auto">
              <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wider">Snippets</div>
              <div className="pb-2">
                {SNIPPET_GROUPS.map((group) => (
                  <div key={group.label} className="mb-2">
                    <div className="px-3 py-1 text-xs text-gray-500 font-semibold">{group.label}</div>
                    {group.snippets.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => { setSql(s.sql); setSidebarOpen(false); }}
                        className="w-full text-left px-3 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors truncate"
                        title={s.sql}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* SQL Editor */}
            <div className="bg-gray-900 border-b border-gray-800 shrink-0">
              <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-600 whitespace-nowrap">SQL Editor — Ctrl+Enter to run</span>
                <div className="hidden md:flex gap-1 flex-wrap">
                  {SNIPPET_GROUPS.map((g) =>
                    g.snippets.slice(0, 2).map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setSql(s.sql)}
                        className={`text-xs px-2 py-0.5 rounded border ${colorMap[g.color]} transition-colors`}
                      >
                        {s.label}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="relative">
                <textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-gray-950 text-green-300 px-4 py-3 text-sm resize-none focus:outline-none border-t border-gray-800"
                  rows={5}
                  spellCheck={false}
                  placeholder="Type your SQL here…"
                />
              </div>
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-700">
                  Supports: CREATE, DROP, TRUNCATE, INSERT, SELECT, LEFT JOIN, UPDATE, DELETE, ALTER, \dt, \d
                </span>
                <button
                  onClick={handleRun}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded font-semibold transition-colors shadow"
                >
                  ▶ Run
                </button>
              </div>
            </div>

            {/* Output Tabs */}
            <div className="bg-gray-900 border-b border-gray-800 flex shrink-0">
              {(["result", "history", "schema"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs uppercase tracking-wide transition-colors ${
                    activeTab === tab
                      ? "text-green-400 border-b-2 border-green-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab}
                  {tab === "history" && history.length > 0 && (
                    <span className="ml-1 text-gray-600">({history.length})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Output Panel */}
            <div className="flex-1 overflow-auto bg-gray-950 p-4">
              {/* RESULT */}
              {activeTab === "result" && (
                <>
                  {!lastEntry ? (
                    <p className="text-gray-600 text-sm italic">Run a query to see results here.</p>
                  ) : (
                    <div>
                      <div
                        className={`flex items-center gap-2 mb-3 text-sm ${lastEntry.result.success ? "text-green-400" : "text-red-400"}`}
                      >
                        <span>{lastEntry.result.success ? "✓" : "✗"}</span>
                        <span className="font-semibold">{lastEntry.result.command ?? "QUERY"}</span>
                        <span className="text-gray-500">—</span>
                        <span>{lastEntry.result.message}</span>
                      </div>
                      {lastEntry.result.rows && lastEntry.result.rows.length > 0 && (
                        <>
                          <DataGrid rows={lastEntry.result.rows} />
                          <p className="mt-2 text-xs text-gray-600">
                            ({lastEntry.result.rowCount} row{lastEntry.result.rowCount !== 1 ? "s" : ""})
                          </p>
                        </>
                      )}
                      {lastEntry.result.rows && lastEntry.result.rows.length === 0 && (
                        <p className="text-gray-600 text-xs italic">No rows returned.</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* HISTORY */}
              {activeTab === "history" && (
                <div className="space-y-3">
                  {history.length === 0 ? (
                    <p className="text-gray-600 text-sm italic">No queries run yet.</p>
                  ) : (
                    history.map((entry, i) => (
                      <div key={i} className="border border-gray-800 rounded bg-gray-900 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800">
                          <div className="flex items-center gap-2">
                            <span className={entry.result.success ? "text-green-400" : "text-red-400"}>
                              {entry.result.success ? "✓" : "✗"}
                            </span>
                            <span className="text-xs text-blue-300 font-semibold">
                              {entry.result.command ?? "QUERY"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{entry.timestamp}</span>
                            <button
                              onClick={() => setSql(entry.sql)}
                              className="text-xs text-gray-500 hover:text-gray-300 underline"
                            >
                              reuse
                            </button>
                          </div>
                        </div>
                        <div className="px-3 py-2 text-xs text-green-300 font-mono whitespace-pre-wrap">
                          {entry.sql}
                        </div>
                        <div
                          className={`px-3 pb-2 text-xs ${entry.result.success ? "text-gray-500" : "text-red-400"}`}
                        >
                          {entry.result.message}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={historyEndRef} />
                </div>
              )}

              {/* SCHEMA */}
              {activeTab === "schema" && (
                <div className="space-y-4">
                  {tableNames.length === 0 ? (
                    <p className="text-gray-600 text-sm italic">
                      No tables created yet. Try: CREATE TABLE or click &quot;Seed DB&quot;
                    </p>
                  ) : (
                    tableNames.map((tableName) => {
                      const tbl = db.tables[tableName];
                      return (
                        <div key={tableName} className="border border-gray-800 rounded bg-gray-900 overflow-hidden">
                          <div className="px-3 py-2 bg-gray-800 flex items-center justify-between">
                            <span className="text-green-400 font-semibold text-sm">📋 {tableName}</span>
                            <span className="text-xs text-gray-500">{tbl.rows.length} row(s)</span>
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-800">
                                <th className="px-3 py-1.5 text-left text-blue-300">column</th>
                                <th className="px-3 py-1.5 text-left text-blue-300">type</th>
                                <th className="px-3 py-1.5 text-left text-blue-300">nullable</th>
                                <th className="px-3 py-1.5 text-left text-blue-300">PK</th>
                                <th className="px-3 py-1.5 text-left text-blue-300">default</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tbl.schema.columns.map((col) => (
                                <tr key={col.name} className="border-b border-gray-800 hover:bg-gray-800">
                                  <td className="px-3 py-1.5 text-yellow-300">{col.name}</td>
                                  <td className="px-3 py-1.5 text-purple-300">{col.type}</td>
                                  <td className="px-3 py-1.5 text-gray-400">{col.nullable ? "YES" : "NO"}</td>
                                  <td className="px-3 py-1.5">
                                    {col.primaryKey ? <span className="text-orange-400">PK</span> : ""}
                                  </td>
                                  <td className="px-3 py-1.5 text-gray-500">{col.defaultValue ?? ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* ── Floating Table Panels — desktop only (fixed px positions don't work on mobile) */}
      {view === "query" &&
        openPanels.map((panel, zIdx) => {
          const tbl = db.tables[panel.tableName];
          if (!tbl) return null;
          return (
            <div
              key={panel.id}
              style={{ position: "fixed", left: panel.x, top: panel.y, zIndex: 100 + zIdx, width: panel.width, height: panel.height }}
              className="hidden md:flex bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-hidden select-none flex-col"
              onMouseDown={() => bringToFront(panel.id)}
            >
              {/* Drag handle header */}
              <div
                className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDragging({ id: panel.id, ox: e.clientX - panel.x, oy: e.clientY - panel.y });
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-green-400 text-sm">📋</span>
                  <span className="text-green-300 font-semibold text-sm">{panel.tableName}</span>
                  <span className="text-gray-500 text-xs">{tbl.rows.length} row(s)</span>
                  <span className="text-gray-600 text-xs">{tbl.schema.columns.length} col(s)</span>
                </div>
                <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setSql(`SELECT * FROM ${panel.tableName};`);
                    }}
                    className="text-xs text-gray-500 hover:text-blue-400 px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
                    title="Load SELECT query"
                  >
                    SELECT
                  </button>
                  <button
                    onClick={() => closePanel(panel.id)}
                    className="text-gray-500 hover:text-red-400 text-lg leading-none px-1 transition-colors"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Mini data grid — fills remaining height */}
              <div className="flex-1 overflow-auto min-h-0">
                {tbl.schema.columns.length === 0 ? (
                  <p className="p-3 text-gray-600 text-xs italic">No columns defined.</p>
                ) : (
                  <table className="text-xs border-collapse min-w-max w-full">
                    <thead className="sticky top-0 bg-gray-800">
                      <tr>
                        {tbl.schema.columns.map((col) => (
                          <th
                            key={col.name}
                            className="px-3 py-1.5 text-left border border-gray-700 whitespace-nowrap font-semibold"
                          >
                            <span className="text-blue-300">{col.name}</span>
                            <span className="text-gray-600 ml-1 font-normal">{col.type}</span>
                            {col.primaryKey && <span className="text-orange-400 ml-1 text-xs">PK</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tbl.schema.columns.length}
                            className="px-3 py-4 text-gray-600 italic text-center border border-gray-800"
                          >
                            No rows
                          </td>
                        </tr>
                      ) : (
                        tbl.rows.map((row, i) => (
                          <tr
                            key={i}
                            className={`${i % 2 === 0 ? "bg-gray-950" : "bg-gray-900"} hover:bg-gray-800 transition-colors`}
                          >
                            {tbl.schema.columns.map((col) => {
                              const val = row[col.name];
                              return (
                                <td key={col.name} className="px-3 py-1 border border-gray-800 whitespace-nowrap">
                                  {val === null || val === undefined ? (
                                    <span className="text-gray-600 italic">NULL</span>
                                  ) : typeof val === "number" ||
                                    (typeof val === "string" && val !== "" && !isNaN(Number(val))) ? (
                                    <span className="text-amber-300">{String(val)}</span>
                                  ) : (
                                    <span className="text-gray-300">{String(val)}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ── Resize handles ── */}
              {/* Right edge */}
              <div
                className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize hover:bg-blue-500/20 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setResizing({ id: panel.id, edge: "right", startX: e.clientX, startY: e.clientY, startW: panel.width, startH: panel.height });
                }}
              />
              {/* Bottom edge */}
              <div
                className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize hover:bg-blue-500/20 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setResizing({ id: panel.id, edge: "bottom", startX: e.clientX, startY: e.clientY, startW: panel.width, startH: panel.height });
                }}
              />
              {/* Bottom-right corner */}
              <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10 flex items-end justify-end p-0.5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setResizing({ id: panel.id, edge: "corner", startX: e.clientX, startY: e.clientY, startW: panel.width, startH: panel.height });
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 9L9 1M4 9L9 4M7 9L9 7" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          );
        })}
    </div>
  );
}
