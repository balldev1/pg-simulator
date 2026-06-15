"use client";

interface SqlDocsProps {
  onUseQuery: (sql: string) => void;
}

interface Example {
  label: string;
  sql: string;
}

interface Section {
  id: string;
  title: string;
  badge?: string;
  content: React.ReactNode;
  examples?: Example[];
}

function CodeBlock({ sql, onUse }: { sql: string; onUse?: () => void }) {
  return (
    <div className="relative group">
      <pre className="bg-gray-950 border border-gray-700 rounded p-3 text-xs text-green-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {sql}
      </pre>
      {onUse && (
        <button
          onClick={onUse}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
        >
          Try it
        </button>
      )}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  const colors: Record<string, string> = {
    ddl: "bg-blue-900 text-blue-300 border-blue-700",
    dml: "bg-green-900 text-green-300 border-green-700",
    join: "bg-orange-900 text-orange-300 border-orange-700",
    meta: "bg-purple-900 text-purple-300 border-purple-700",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${colors[color] ?? "bg-gray-800 text-gray-400 border-gray-700"}`}>
      {text}
    </span>
  );
}

export default function SqlDocs({ onUseQuery }: SqlDocsProps) {
  const sections: Section[] = [
    {
      id: "types",
      title: "Data Types",
      content: (
        <div className="overflow-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-gray-800">
                <th className="px-3 py-2 text-left text-blue-300 border border-gray-700">Type</th>
                <th className="px-3 py-2 text-left text-blue-300 border border-gray-700">Description</th>
                <th className="px-3 py-2 text-left text-blue-300 border border-gray-700">Example value</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["SERIAL", "Auto-incrementing integer (primary key)", "1, 2, 3…"],
                ["INTEGER", "Whole number", "42, -7, 0"],
                ["NUMERIC", "Decimal / money", "3.14, 1299.99"],
                ["VARCHAR", "Variable-length text", "'Alice', 'pending'"],
                ["BOOLEAN", "True or false", "TRUE, FALSE"],
                ["DATE", "Calendar date", "'2024-01-15'"],
                ["TIMESTAMP", "Date + time", "'2024-01-15 09:00:00'"],
                ["TEXT", "Unlimited text", "'any length…'"],
                ["JSON", "JSON object/array", "'{\"key\": 1}'"],
              ].map(([type, desc, ex], i) => (
                <tr key={type} className={i % 2 === 0 ? "bg-gray-950" : "bg-gray-900"}>
                  <td className="px-3 py-1.5 text-yellow-300 font-mono border border-gray-800">{type}</td>
                  <td className="px-3 py-1.5 text-gray-300 border border-gray-800">{desc}</td>
                  <td className="px-3 py-1.5 text-green-400 font-mono border border-gray-800">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "create",
      title: "CREATE TABLE",
      badge: "ddl",
      content: (
        <div className="space-y-3 text-sm text-gray-300">
          <p>Creates a new table. Define columns with their types and constraints.</p>
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-400">
            <span className="text-blue-300">CREATE TABLE</span> table_name (<br />
            {"  "}column_name <span className="text-yellow-300">TYPE</span> [<span className="text-purple-300">CONSTRAINTS</span>],<br />
            {"  "}…<br />
            );
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["PRIMARY KEY", "Unique identifier, NOT NULL"],
              ["NOT NULL", "Column must have a value"],
              ["SERIAL", "Auto-increment (no INSERT needed)"],
              ["DEFAULT val", "Fallback when omitted"],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-900 rounded p-2 border border-gray-800">
                <span className="text-purple-300 font-mono">{k}</span>
                <span className="text-gray-500 ml-2">{v}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      examples: [
        {
          label: "Create orders table",
          sql: `CREATE TABLE orders (\n  id SERIAL PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  total NUMERIC,\n  status VARCHAR\n);`,
        },
      ],
    },
    {
      id: "alter",
      title: "ALTER / DROP / TRUNCATE",
      badge: "ddl",
      content: (
        <div className="space-y-2 text-xs text-gray-300">
          <p className="text-sm">Modify or remove existing tables.</p>
          {[
            ["ALTER TABLE … ADD COLUMN", "Add a new column to an existing table"],
            ["ALTER TABLE … DROP COLUMN", "Remove a column"],
            ["TRUNCATE TABLE …", "Delete all rows but keep the schema"],
            ["DROP TABLE …", "Delete the table entirely"],
            ["DROP TABLE IF EXISTS …", "Safe drop — no error if table doesn't exist"],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-3 items-start py-1 border-b border-gray-800">
              <code className="text-green-300 font-mono whitespace-nowrap min-w-0 shrink-0">{cmd}</code>
              <span className="text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      ),
      examples: [
        { label: "Add column", sql: `ALTER TABLE users ADD COLUMN phone VARCHAR;` },
        { label: "Drop column", sql: `ALTER TABLE users DROP COLUMN phone;` },
        { label: "Truncate", sql: `TRUNCATE TABLE orders;` },
      ],
    },
    {
      id: "insert",
      title: "INSERT INTO",
      badge: "dml",
      content: (
        <div className="space-y-3 text-sm text-gray-300">
          <p>Insert a new row. SERIAL columns are filled automatically — don&apos;t include them.</p>
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-400">
            <span className="text-blue-300">INSERT INTO</span> table (col1, col2, …)<br />
            <span className="text-blue-300">VALUES</span> (val1, val2, …);
          </div>
        </div>
      ),
      examples: [
        {
          label: "Insert a user",
          sql: `INSERT INTO users (name, email, age)\nVALUES ('David Lee', 'david@example.com', 30);`,
        },
        {
          label: "Insert an order",
          sql: `INSERT INTO orders (user_id, total, status)\nVALUES (2, 199.99, 'pending');`,
        },
      ],
    },
    {
      id: "select",
      title: "SELECT",
      badge: "dml",
      content: (
        <div className="space-y-3 text-sm text-gray-300">
          <p>Query rows from a table. Clauses are processed in this order: FROM → WHERE → ORDER BY → LIMIT.</p>
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-400 space-y-1">
            <div><span className="text-blue-300">SELECT</span> * | col1, col2, …</div>
            <div><span className="text-blue-300">FROM</span> table_name</div>
            <div>[<span className="text-blue-300">WHERE</span> condition]</div>
            <div>[<span className="text-blue-300">ORDER BY</span> col [ASC | DESC]]</div>
            <div>[<span className="text-blue-300">LIMIT</span> n] [<span className="text-blue-300">OFFSET</span> n]</div>
          </div>
        </div>
      ),
      examples: [
        { label: "All rows", sql: `SELECT * FROM users;` },
        { label: "Column projection", sql: `SELECT name, email FROM users;` },
        { label: "WHERE filter", sql: `SELECT * FROM users WHERE age > 25;` },
        { label: "LIKE pattern", sql: `SELECT * FROM users WHERE name LIKE '%Alice%';` },
        { label: "Order + Limit", sql: `SELECT * FROM products ORDER BY price DESC LIMIT 3;` },
        { label: "Offset pagination", sql: `SELECT * FROM users ORDER BY id ASC LIMIT 2 OFFSET 1;` },
      ],
    },
    {
      id: "operators",
      title: "WHERE Operators",
      content: (
        <div className="overflow-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-gray-800">
                <th className="px-3 py-2 text-left text-blue-300 border border-gray-700">Operator</th>
                <th className="px-3 py-2 text-left text-blue-300 border border-gray-700">Meaning</th>
                <th className="px-3 py-2 text-left text-blue-300 border border-gray-700">Example</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["=", "Equal", "age = 28"],
                ["!= / <>", "Not equal", "status != 'pending'"],
                ["> / <", "Greater / Less than", "price > 100"],
                [">= / <=", "Greater/Less or equal", "age >= 18"],
                ["LIKE", "Pattern match (% = wildcard)", "name LIKE '%Smith'"],
                ["IS NULL", "Value is NULL", "phone IS NULL"],
                ["IS NOT NULL", "Value is not NULL", "email IS NOT NULL"],
                ["AND", "Both conditions true", "age > 20 AND age < 40"],
              ].map(([op, meaning, ex], i) => (
                <tr key={op} className={i % 2 === 0 ? "bg-gray-950" : "bg-gray-900"}>
                  <td className="px-3 py-1.5 text-yellow-300 font-mono border border-gray-800">{op}</td>
                  <td className="px-3 py-1.5 text-gray-300 border border-gray-800">{meaning}</td>
                  <td className="px-3 py-1.5 text-green-400 font-mono border border-gray-800">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "join",
      title: "LEFT JOIN",
      badge: "join",
      content: (
        <div className="space-y-4 text-sm text-gray-300">
          <p>
            Combines rows from two tables based on a matching column. With <span className="text-orange-300 font-semibold">LEFT JOIN</span>,
            every row from the <em>left</em> table is kept — even when there is no match in the right table (those columns become <span className="text-gray-500 italic">NULL</span>).
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-400 space-y-1">
            <div><span className="text-blue-300">SELECT</span> a.col, b.col, …</div>
            <div><span className="text-blue-300">FROM</span> left_table [<span className="text-blue-300">AS</span> a]</div>
            <div><span className="text-orange-300">LEFT JOIN</span> right_table [<span className="text-blue-300">AS</span> b]</div>
            <div><span className="text-blue-300">ON</span> a.id = b.foreign_key;</div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono space-y-3">
            <div className="text-gray-500">-- Seed data — tables linked to users.id</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-blue-300 mb-1">users (left table)</div>
                <div className="text-gray-500">id │ name</div>
                <div className="text-gray-400">1  │ Alice</div>
                <div className="text-gray-400">2  │ Bob</div>
                <div className="text-gray-400">3  │ Carol</div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-orange-300 mb-1">orders  (user_id → users.id)</div>
                  <div className="text-gray-500">id │ user_id</div>
                  <div className="text-gray-400">1  │ 1  <span className="text-gray-600">← Alice</span></div>
                  <div className="text-gray-400">2  │ 1  <span className="text-gray-600">← Alice</span></div>
                  <div className="text-gray-400">3  │ 3  <span className="text-gray-600">← Carol</span></div>
                </div>
                <div>
                  <div className="text-orange-300 mb-1">reviews  (user_id → users.id)</div>
                  <div className="text-gray-500">id │ user_id │ rating</div>
                  <div className="text-gray-400">1  │ 1       │ 5  <span className="text-gray-600">← Alice</span></div>
                  <div className="text-gray-400">2  │ 1       │ 4  <span className="text-gray-600">← Alice</span></div>
                  <div className="text-gray-400">3  │ 2       │ 3  <span className="text-gray-600">← Bob</span></div>
                </div>
                <div>
                  <div className="text-orange-300 mb-1">addresses  (user_id → users.id)</div>
                  <div className="text-gray-500">id │ user_id │ city</div>
                  <div className="text-gray-400">1  │ 1       │ Bangkok    <span className="text-gray-600">← Alice</span></div>
                  <div className="text-gray-400">2  │ 2       │ Chiang Mai <span className="text-gray-600">← Bob</span></div>
                </div>
              </div>
            </div>
            <div className="text-gray-500 border-t border-gray-700 pt-2">-- users LEFT JOIN orders ON u.id = o.user_id</div>
            <div className="text-gray-500">u.name │ o.id   │ o.total</div>
            <div className="text-green-400">Alice  │ 1      │ 149.99  <span className="text-gray-600">← match</span></div>
            <div className="text-green-400">Alice  │ 2      │ 299.50  <span className="text-gray-600">← 2nd order</span></div>
            <div className="text-amber-400">Bob    │ NULL   │ NULL    <span className="text-gray-600">← no orders, kept from left</span></div>
            <div className="text-green-400">Carol  │ 3      │  89.00  <span className="text-gray-600">← match</span></div>
          </div>
        </div>
      ),
      examples: [
        {
          label: "LEFT JOIN users + orders",
          sql: `SELECT u.id, u.name, o.id AS order_id, o.total, o.status\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id;`,
        },
        {
          label: "LEFT JOIN with WHERE",
          sql: `SELECT u.name, o.total\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE o.status = 'completed';`,
        },
        {
          label: "LEFT JOIN — users with no orders",
          sql: `SELECT u.id, u.name\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE o.id IS NULL;`,
        },
      ],
    },
    {
      id: "update",
      title: "UPDATE",
      badge: "dml",
      content: (
        <div className="space-y-3 text-sm text-gray-300">
          <p>
            Modifies existing rows. Always use <span className="text-red-400 font-semibold">WHERE</span> — without it, every row is updated.
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-400">
            <span className="text-blue-300">UPDATE</span> table<br />
            <span className="text-blue-300">SET</span> col1 = val1, col2 = val2, …<br />
            [<span className="text-red-400">WHERE</span> condition];
          </div>
        </div>
      ),
      examples: [
        { label: "Update a row", sql: `UPDATE users SET age = 29 WHERE name = 'Alice Smith';` },
        { label: "Update order status", sql: `UPDATE orders SET status = 'completed' WHERE id = 2;` },
      ],
    },
    {
      id: "delete",
      title: "DELETE",
      badge: "dml",
      content: (
        <div className="space-y-3 text-sm text-gray-300">
          <p>
            Removes rows permanently. Always use <span className="text-red-400 font-semibold">WHERE</span> — without it, all rows are deleted (use TRUNCATE for that intent).
          </p>
          <div className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-400">
            <span className="text-blue-300">DELETE FROM</span> table<br />
            [<span className="text-red-400">WHERE</span> condition];
          </div>
        </div>
      ),
      examples: [
        { label: "Delete a row", sql: `DELETE FROM orders WHERE id = 3;` },
        { label: "Delete by condition", sql: `DELETE FROM users WHERE age < 20;` },
      ],
    },
    {
      id: "meta",
      title: "Meta Commands",
      badge: "meta",
      content: (
        <div className="space-y-2 text-sm text-gray-300">
          <p>psql-style commands for inspecting the database schema.</p>
          <div className="grid gap-2">
            {[
              ["\\dt", "List all tables with row and column counts"],
              ["\\d users", "Describe table columns, types, and constraints"],
            ].map(([cmd, desc]) => (
              <div key={cmd} className="flex gap-3 items-start bg-gray-900 border border-gray-800 rounded p-2">
                <code className="text-green-300 font-mono text-xs">{cmd}</code>
                <span className="text-gray-400 text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      examples: [
        { label: "List tables", sql: `\\dt` },
        { label: "Describe users", sql: `\\d users` },
        { label: "Describe orders", sql: `\\d orders` },
      ],
    },
  ];

  const NAV_ITEMS = [
    { id: "types", label: "Data Types" },
    { id: "create", label: "CREATE TABLE" },
    { id: "alter", label: "ALTER / DROP" },
    { id: "insert", label: "INSERT" },
    { id: "select", label: "SELECT" },
    { id: "operators", label: "Operators" },
    { id: "join", label: "LEFT JOIN" },
    { id: "update", label: "UPDATE" },
    { id: "delete", label: "DELETE" },
    { id: "meta", label: "Meta Commands" },
  ];

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
      {/* Sticky nav */}
      <nav className="w-44 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0 py-3">
        <div className="px-3 mb-2 text-xs text-gray-500 uppercase tracking-wider font-semibold">SQL Reference</div>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#doc-${item.id}`}
            className="block px-3 py-1.5 text-xs text-gray-400 hover:text-green-400 hover:bg-gray-800 transition-colors rounded mx-1"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-950 px-6 py-5 space-y-10">
        <div>
          <h1 className="text-green-400 text-xl font-bold font-mono mb-1">SQL Reference</h1>
          <p className="text-gray-500 text-sm">
            Complete guide to SQL syntax supported by this simulator. Click <span className="text-blue-400">Try it</span> on any example to load it into the editor.
          </p>
        </div>

        {sections.map((section) => (
          <section key={section.id} id={`doc-${section.id}`} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
              <h2 className="text-white font-semibold font-mono">{section.title}</h2>
              {section.badge && <Badge text={section.badge.toUpperCase()} color={section.badge} />}
            </div>

            {section.content}

            {section.examples && section.examples.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider mt-3">Examples</div>
                {section.examples.map((ex) => (
                  <div key={ex.label} className="space-y-1">
                    <div className="text-xs text-gray-500">{ex.label}</div>
                    <CodeBlock sql={ex.sql} onUse={() => onUseQuery(ex.sql)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <div className="h-10" />
      </div>
    </div>
  );
}
