export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
}

export interface TableSchema {
  name: string;
  columns: Column[];
}

export interface Row {
  [key: string]: unknown;
}

export interface Database {
  tables: {
    [tableName: string]: {
      schema: TableSchema;
      rows: Row[];
      sequence: number;
    };
  };
}

export interface QueryResult {
  success: boolean;
  message: string;
  rows?: Row[];
  rowCount?: number;
  command?: string;
}

const DB_KEY = "pg_simulator_db";

function loadDB(): Database {
  if (typeof window === "undefined") return { tables: {} };
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : { tables: {} };
  } catch {
    return { tables: {} };
  }
}

function saveDB(db: Database): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function parseColumnDef(colDef: string): Column {
  const parts = colDef.trim().split(/\s+/);
  const name = parts[0].replace(/["`]/g, "");
  const typeRaw = parts[1]?.toUpperCase() || "TEXT";

  let type = typeRaw;
  if (typeRaw.includes("SERIAL")) type = "SERIAL";
  else if (typeRaw.includes("INT")) type = "INTEGER";
  else if (typeRaw.includes("VARCHAR") || typeRaw.includes("CHAR")) type = "VARCHAR";
  else if (typeRaw.includes("BOOL")) type = "BOOLEAN";
  else if (typeRaw.includes("FLOAT") || typeRaw.includes("DOUBLE") || typeRaw.includes("REAL")) type = "FLOAT";
  else if (typeRaw.includes("NUMERIC") || typeRaw.includes("DECIMAL")) type = "NUMERIC";
  else if (typeRaw.includes("DATE")) type = "DATE";
  else if (typeRaw.includes("TIMESTAMP")) type = "TIMESTAMP";
  else if (typeRaw.includes("JSON")) type = "JSON";

  const upper = colDef.toUpperCase();
  const primaryKey = upper.includes("PRIMARY KEY");
  const nullable = !upper.includes("NOT NULL") && !primaryKey;

  let defaultValue: string | undefined;
  const defMatch = colDef.match(/DEFAULT\s+(\S+)/i);
  if (defMatch) defaultValue = defMatch[1];

  return { name, type, nullable, primaryKey, defaultValue };
}

function castValue(val: string, type: string): unknown {
  if (val === "NULL" || val === "null") return null;
  const v = val.replace(/^['"]|['"]$/g, "");
  if (type === "INTEGER" || type === "SERIAL") return parseInt(v, 10);
  if (type === "FLOAT" || type === "NUMERIC") return parseFloat(v);
  if (type === "BOOLEAN") return v.toLowerCase() === "true" || v === "1";
  return v;
}

// Supports alias.col notation (e.g. u.name, orders.total) for JOIN queries
function evaluateWhere(row: Row, whereClause: string): boolean {
  const conditions = whereClause.split(/\s+AND\s+/i);
  return conditions.every((cond) => {
    const trimmed = cond.trim();

    const isNullMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s+IS\s+NULL$/i);
    if (isNullMatch) {
      const v = row[isNullMatch[1]];
      return v === null || v === undefined;
    }

    const isNotNullMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const v = row[isNotNullMatch[1]];
      return v !== null && v !== undefined;
    }

    const likeMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s+LIKE\s+'([^']*)'/i);
    if (likeMatch) {
      const val = String(row[likeMatch[1]] ?? "");
      const pattern = likeMatch[2].replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(val);
    }

    const opMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s*(>=|<=|!=|<>|=|>|<)\s*(.+)$/);
    if (!opMatch) return true;
    const [, col, op, rawVal] = opMatch;
    const rowVal = row[col];
    const cmpVal = rawVal.trim().replace(/^['"]|['"]$/g, "");
    const a = isNaN(Number(rowVal)) ? String(rowVal) : Number(rowVal);
    const b = isNaN(Number(cmpVal)) ? cmpVal : Number(cmpVal);
    if (op === "=") return a == b;
    if (op === "!=" || op === "<>") return a != b;
    if (op === ">") return a > b;
    if (op === "<") return a < b;
    if (op === ">=") return a >= b;
    if (op === "<=") return a <= b;
    return true;
  });
}

// ─── SQL Parser & Executor ───────────────────────────────────────────────────

export function executeSQL(sql: string): QueryResult {
  const db = loadDB();
  const stmt = sql.trim().replace(/;$/, "").trim();
  const upper = stmt.toUpperCase();

  // CREATE TABLE
  if (upper.startsWith("CREATE TABLE")) {
    const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)/is);
    if (!m) return { success: false, message: "Syntax error in CREATE TABLE" };
    const tableName = m[1].toLowerCase();
    if (db.tables[tableName]) return { success: false, message: `Table "${tableName}" already exists` };

    const colDefs = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(
        (s) =>
          !s.toUpperCase().startsWith("PRIMARY KEY") &&
          !s.toUpperCase().startsWith("FOREIGN KEY") &&
          !s.toUpperCase().startsWith("UNIQUE") &&
          !s.toUpperCase().startsWith("CHECK") &&
          s.length > 0
      );
    const columns = colDefs.map(parseColumnDef);

    db.tables[tableName] = { schema: { name: tableName, columns }, rows: [], sequence: 1 };
    saveDB(db);
    return { success: true, message: `Table "${tableName}" created successfully`, command: "CREATE TABLE" };
  }

  // DROP TABLE
  if (upper.startsWith("DROP TABLE")) {
    const m = stmt.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
    if (!m) return { success: false, message: "Syntax error in DROP TABLE" };
    const tableName = m[1].toLowerCase();
    if (!db.tables[tableName]) return { success: false, message: `Table "${tableName}" does not exist` };
    delete db.tables[tableName];
    saveDB(db);
    return { success: true, message: `Table "${tableName}" dropped`, command: "DROP TABLE" };
  }

  // TRUNCATE
  if (upper.startsWith("TRUNCATE")) {
    const m = stmt.match(/TRUNCATE\s+(?:TABLE\s+)?(\w+)/i);
    if (!m) return { success: false, message: "Syntax error in TRUNCATE" };
    const tableName = m[1].toLowerCase();
    if (!db.tables[tableName]) return { success: false, message: `Table "${tableName}" does not exist` };
    const count = db.tables[tableName].rows.length;
    db.tables[tableName].rows = [];
    db.tables[tableName].sequence = 1;
    saveDB(db);
    return {
      success: true,
      message: `Table "${tableName}" truncated (${count} rows removed)`,
      rowCount: count,
      command: "TRUNCATE",
    };
  }

  // INSERT INTO
  if (upper.startsWith("INSERT INTO")) {
    const m = stmt.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)/i);
    if (!m)
      return {
        success: false,
        message: "Syntax error in INSERT INTO. Use: INSERT INTO table (col1, col2) VALUES (val1, val2)",
      };
    const tableName = m[1].toLowerCase();
    const tbl = db.tables[tableName];
    if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };

    const cols = m[2].split(",").map((s) => s.trim().replace(/["`]/g, ""));
    const vals = m[3].match(/('[^']*'|[^,]+)/g)?.map((s) => s.trim()) ?? [];

    if (cols.length !== vals.length)
      return { success: false, message: `Column count (${cols.length}) does not match value count (${vals.length})` };

    const row: Row = {};
    tbl.schema.columns.forEach((col) => {
      if (col.type === "SERIAL") row[col.name] = tbl.sequence++;
    });

    cols.forEach((col, i) => {
      const colDef = tbl.schema.columns.find((c) => c.name === col);
      row[col] = colDef ? castValue(vals[i], colDef.type) : vals[i].replace(/^['"]|['"]$/g, "");
    });

    tbl.schema.columns.forEach((col) => {
      if (!(col.name in row)) {
        if (col.defaultValue) row[col.name] = col.defaultValue;
        else row[col.name] = null;
      }
    });

    tbl.rows.push(row);
    saveDB(db);
    return { success: true, message: `1 row inserted into "${tableName}"`, rows: [row], rowCount: 1, command: "INSERT" };
  }

  // SELECT (single-table and JOIN)
  if (upper.startsWith("SELECT")) {
    // JOIN branch
    if (/\bJOIN\b/i.test(upper)) {
      const joinM = stmt.match(
        /SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+(LEFT\s+(?:OUTER\s+)?JOIN|(?:INNER\s+)?JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)(.*)/is
      );
      if (!joinM)
        return {
          success: false,
          message:
            "Syntax error in JOIN. Format: SELECT ... FROM t1 [AS a] LEFT JOIN t2 [AS b] ON a.col = b.col",
        };

      const [, rawCols, t1Name, t1AliasRaw, joinType, t2Name, t2AliasRaw, onA, onACol, , onBCol, rest] = joinM;
      const leftName = t1Name.toLowerCase();
      const rightName = t2Name.toLowerCase();
      const leftAlias = (t1AliasRaw || t1Name).toLowerCase();
      const rightAlias = (t2AliasRaw || t2Name).toLowerCase();
      const isLeftJoin = /LEFT/i.test(joinType);

      const tbl1 = db.tables[leftName];
      const tbl2 = db.tables[rightName];
      if (!tbl1) return { success: false, message: `Table "${leftName}" does not exist` };
      if (!tbl2) return { success: false, message: `Table "${rightName}" does not exist` };

      // Determine which ON side belongs to which table
      const onALower = onA.toLowerCase();
      let leftJoinCol: string, rightJoinCol: string;
      if (onALower === leftAlias || onALower === leftName) {
        leftJoinCol = onACol.toLowerCase();
        rightJoinCol = onBCol.toLowerCase();
      } else {
        leftJoinCol = onBCol.toLowerCase();
        rightJoinCol = onACol.toLowerCase();
      }

      // Build joined rows; store both alias.col and bare col (t1 first, t2 overwrites on conflict)
      let joined: Row[] = [];
      for (const r1 of tbl1.rows) {
        const matches = tbl2.rows.filter((r2) => {
          const v1 = r1[leftJoinCol];
          const v2 = r2[rightJoinCol];
          return (
            v1 !== null && v1 !== undefined && v2 !== null && v2 !== undefined && String(v1) === String(v2)
          );
        });

        if (matches.length > 0) {
          for (const r2 of matches) {
            const merged: Row = {};
            for (const col of tbl1.schema.columns) {
              merged[col.name] = r1[col.name];
              merged[`${leftAlias}.${col.name}`] = r1[col.name];
            }
            for (const col of tbl2.schema.columns) {
              if (!(col.name in merged)) merged[col.name] = r2[col.name];
              merged[`${rightAlias}.${col.name}`] = r2[col.name];
            }
            joined.push(merged);
          }
        } else if (isLeftJoin) {
          const merged: Row = {};
          for (const col of tbl1.schema.columns) {
            merged[col.name] = r1[col.name];
            merged[`${leftAlias}.${col.name}`] = r1[col.name];
          }
          for (const col of tbl2.schema.columns) {
            if (!(col.name in merged)) merged[col.name] = null;
            merged[`${rightAlias}.${col.name}`] = null;
          }
          joined.push(merged);
        }
      }

      // WHERE
      const restStr = (rest || "").trim();
      const whereM = restStr.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/i);
      if (whereM) joined = joined.filter((r) => evaluateWhere(r, whereM[1].trim()));

      // ORDER BY
      const orderM = restStr.match(/ORDER\s+BY\s+(\w+(?:\.\w+)?)(?:\s+(ASC|DESC))?/i);
      if (orderM) {
        const col = orderM[1];
        const dir = (orderM[2] || "ASC").toUpperCase();
        joined.sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av == null) return 1;
          if (bv == null) return -1;
          return dir === "ASC" ? (av < bv ? -1 : av > bv ? 1 : 0) : av > bv ? -1 : av < bv ? 1 : 0;
        });
      }

      // LIMIT
      const limitM = restStr.match(/LIMIT\s+(\d+)/i);
      if (limitM) joined = joined.slice(0, parseInt(limitM[1]));

      // Projection: SELECT * shows alias.col columns; SELECT u.*, col shows expanded/specific cols
      const colsStr = rawCols.trim();
      let projected: Row[];
      if (colsStr === "*") {
        projected = joined.map((r) => {
          const out: Row = {};
          Object.keys(r)
            .filter((k) => k.includes("."))
            .forEach((k) => {
              out[k] = r[k];
            });
          return out;
        });
      } else {
        const selCols = colsStr.split(",").map((s) => s.trim().replace(/["`]/g, ""));
        projected = joined.map((r) => {
          const out: Row = {};
          selCols.forEach((c) => {
            if (c.endsWith(".*")) {
              const alias = c.slice(0, -2);
              Object.keys(r)
                .filter((k) => k.startsWith(`${alias}.`))
                .forEach((k) => {
                  out[k] = r[k];
                });
            } else {
              out[c] = r[c] ?? null;
            }
          });
          return out;
        });
      }

      return {
        success: true,
        message: `${projected.length} row(s) returned`,
        rows: projected,
        rowCount: projected.length,
        command: "SELECT",
      };
    }

    // Single-table SELECT
    const fromMatch = stmt.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return { success: false, message: "Syntax error: missing FROM clause" };
    const tableName = fromMatch[1].toLowerCase();
    const tbl = db.tables[tableName];
    if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };

    let rows = [...tbl.rows];

    const whereMatch = stmt.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/i);
    if (whereMatch) {
      rows = rows.filter((r) => evaluateWhere(r, whereMatch[1].trim()));
    }

    const orderMatch = stmt.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = (orderMatch[2] || "ASC").toUpperCase();
      rows.sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null) return 1;
        if (bv == null) return -1;
        return dir === "ASC" ? (av < bv ? -1 : av > bv ? 1 : 0) : av > bv ? -1 : av < bv ? 1 : 0;
      });
    }

    const limitMatch = stmt.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) rows = rows.slice(0, parseInt(limitMatch[1]));

    const offsetMatch = stmt.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch) rows = rows.slice(parseInt(offsetMatch[1]));

    const colsPart = stmt.match(/SELECT\s+(.+?)\s+FROM/i)?.[1].trim() ?? "*";
    let projected = rows;
    if (colsPart !== "*") {
      const selectedCols = colsPart.split(",").map((s) => s.trim().replace(/["`]/g, ""));
      projected = rows.map((r) => {
        const out: Row = {};
        selectedCols.forEach((c) => {
          out[c] = r[c];
        });
        return out;
      });
    }

    return {
      success: true,
      message: `${projected.length} row(s) returned`,
      rows: projected,
      rowCount: projected.length,
      command: "SELECT",
    };
  }

  // UPDATE
  if (upper.startsWith("UPDATE")) {
    const m = stmt.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (!m)
      return {
        success: false,
        message: "Syntax error in UPDATE. Use: UPDATE table SET col=val WHERE condition",
      };
    const tableName = m[1].toLowerCase();
    const tbl = db.tables[tableName];
    if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };

    const setParts = m[2].split(",").map((s) => s.trim());
    const whereClause = m[3]?.trim();

    let count = 0;
    tbl.rows = tbl.rows.map((row) => {
      if (whereClause && !evaluateWhere(row, whereClause)) return row;
      const newRow = { ...row };
      setParts.forEach((part) => {
        const [col, ...rest] = part.split("=");
        const colName = col.trim().replace(/["`]/g, "");
        const rawVal = rest.join("=").trim();
        const colDef = tbl.schema.columns.find((c) => c.name === colName);
        newRow[colName] = colDef ? castValue(rawVal, colDef.type) : rawVal.replace(/^['"]|['"]$/g, "");
      });
      count++;
      return newRow;
    });

    saveDB(db);
    return {
      success: true,
      message: `${count} row(s) updated in "${tableName}"`,
      rowCount: count,
      command: "UPDATE",
    };
  }

  // DELETE
  if (upper.startsWith("DELETE")) {
    const m = stmt.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) return { success: false, message: "Syntax error in DELETE FROM" };
    const tableName = m[1].toLowerCase();
    const tbl = db.tables[tableName];
    if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };

    const whereClause = m[2]?.trim();
    const before = tbl.rows.length;
    tbl.rows = whereClause ? tbl.rows.filter((r) => !evaluateWhere(r, whereClause)) : [];
    const deleted = before - tbl.rows.length;

    saveDB(db);
    return {
      success: true,
      message: `${deleted} row(s) deleted from "${tableName}"`,
      rowCount: deleted,
      command: "DELETE",
    };
  }

  // ALTER TABLE
  if (upper.startsWith("ALTER TABLE")) {
    const addM = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(.+)/i);
    if (addM) {
      const tableName = addM[1].toLowerCase();
      const tbl = db.tables[tableName];
      if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };
      const col = parseColumnDef(addM[2].trim());
      if (tbl.schema.columns.find((c) => c.name === col.name))
        return { success: false, message: `Column "${col.name}" already exists` };
      tbl.schema.columns.push(col);
      tbl.rows.forEach((r) => {
        r[col.name] = col.defaultValue ?? null;
      });
      saveDB(db);
      return { success: true, message: `Column "${col.name}" added to "${tableName}"`, command: "ALTER TABLE" };
    }

    const dropM = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+(?:COLUMN\s+)?(\w+)/i);
    if (dropM) {
      const tableName = dropM[1].toLowerCase();
      const tbl = db.tables[tableName];
      if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };
      const colName = dropM[2].toLowerCase();
      tbl.schema.columns = tbl.schema.columns.filter((c) => c.name !== colName);
      tbl.rows.forEach((r) => {
        delete r[colName];
      });
      saveDB(db);
      return {
        success: true,
        message: `Column "${colName}" dropped from "${tableName}"`,
        command: "ALTER TABLE",
      };
    }

    return { success: false, message: "Unsupported ALTER TABLE syntax" };
  }

  // \dt or SHOW TABLES
  if (stmt === "\\dt" || upper === "SHOW TABLES") {
    const tables = Object.keys(db.tables);
    return {
      success: true,
      message: `${tables.length} table(s) in database`,
      rows: tables.map((t) => ({
        table_name: t,
        row_count: db.tables[t].rows.length,
        columns: db.tables[t].schema.columns.length,
      })),
      rowCount: tables.length,
      command: "\\dt",
    };
  }

  // \d tablename
  const descMatch = stmt.match(/^\\d\s+(\w+)$/i);
  if (descMatch) {
    const tableName = descMatch[1].toLowerCase();
    const tbl = db.tables[tableName];
    if (!tbl) return { success: false, message: `Table "${tableName}" does not exist` };
    return {
      success: true,
      message: `Schema for table "${tableName}"`,
      rows: tbl.schema.columns.map((c) => ({
        column: c.name,
        type: c.type,
        nullable: c.nullable ? "YES" : "NO",
        primary_key: c.primaryKey ? "YES" : "",
        default: c.defaultValue ?? "",
      })),
      rowCount: tbl.schema.columns.length,
      command: "\\d",
    };
  }

  return { success: false, message: `Unrecognized command: "${stmt.substring(0, 40)}"` };
}

export function getDatabase(): Database {
  return loadDB();
}

export function clearDatabase(): void {
  if (typeof window !== "undefined") localStorage.removeItem(DB_KEY);
}

export function seedDatabase(): void {
  const db: Database = { tables: {} };

  db.tables["users"] = {
    schema: {
      name: "users",
      columns: [
        { name: "id", type: "SERIAL", nullable: false, primaryKey: true },
        { name: "name", type: "VARCHAR", nullable: false, primaryKey: false },
        { name: "email", type: "VARCHAR", nullable: false, primaryKey: false },
        { name: "age", type: "INTEGER", nullable: true, primaryKey: false },
        { name: "created_at", type: "TIMESTAMP", nullable: true, primaryKey: false, defaultValue: "NOW()" },
      ],
    },
    rows: [
      { id: 1, name: "Alice Smith", email: "alice@example.com", age: 28, created_at: "2024-01-15 09:00:00" },
      { id: 2, name: "Bob Johnson", email: "bob@example.com", age: 34, created_at: "2024-02-20 14:30:00" },
      { id: 3, name: "Carol White", email: "carol@example.com", age: 25, created_at: "2024-03-10 11:15:00" },
    ],
    sequence: 4,
  };

  db.tables["products"] = {
    schema: {
      name: "products",
      columns: [
        { name: "id", type: "SERIAL", nullable: false, primaryKey: true },
        { name: "name", type: "VARCHAR", nullable: false, primaryKey: false },
        { name: "price", type: "NUMERIC", nullable: false, primaryKey: false },
        { name: "stock", type: "INTEGER", nullable: false, primaryKey: false },
        { name: "category", type: "VARCHAR", nullable: true, primaryKey: false },
      ],
    },
    rows: [
      { id: 1, name: "Laptop Pro", price: 1299.99, stock: 50, category: "Electronics" },
      { id: 2, name: "Wireless Mouse", price: 29.99, stock: 200, category: "Electronics" },
      { id: 3, name: "Desk Lamp", price: 45.0, stock: 80, category: "Furniture" },
      { id: 4, name: "Coffee Mug", price: 12.5, stock: 300, category: "Kitchen" },
    ],
    sequence: 5,
  };

  // orders → users.id: Alice has 2 orders, Carol has 1, Bob has none
  db.tables["orders"] = {
    schema: {
      name: "orders",
      columns: [
        { name: "id", type: "SERIAL", nullable: false, primaryKey: true },
        { name: "user_id", type: "INTEGER", nullable: false, primaryKey: false },
        { name: "total", type: "NUMERIC", nullable: true, primaryKey: false },
        { name: "status", type: "VARCHAR", nullable: true, primaryKey: false },
        { name: "created_at", type: "TIMESTAMP", nullable: true, primaryKey: false },
      ],
    },
    rows: [
      { id: 1, user_id: 1, total: 149.99, status: "completed", created_at: "2024-03-01 10:00:00" },
      { id: 2, user_id: 1, total: 299.50, status: "pending",   created_at: "2024-04-15 14:00:00" },
      { id: 3, user_id: 3, total: 89.00,  status: "completed", created_at: "2024-04-20 09:30:00" },
    ],
    sequence: 4,
  };

  // reviews → user_id (users) + product_id (products)
  // Alice reviewed 2 products, Bob reviewed 1, Carol has no reviews → good NULL demo
  db.tables["reviews"] = {
    schema: {
      name: "reviews",
      columns: [
        { name: "id",         type: "SERIAL",    nullable: false, primaryKey: true },
        { name: "user_id",    type: "INTEGER",   nullable: false, primaryKey: false },
        { name: "product_id", type: "INTEGER",   nullable: false, primaryKey: false },
        { name: "rating",     type: "INTEGER",   nullable: false, primaryKey: false },
        { name: "comment",    type: "VARCHAR",   nullable: true,  primaryKey: false },
        { name: "created_at", type: "TIMESTAMP", nullable: true,  primaryKey: false },
      ],
    },
    rows: [
      { id: 1, user_id: 1, product_id: 1, rating: 5, comment: "Great laptop!",  created_at: "2024-02-01 08:00:00" },
      { id: 2, user_id: 1, product_id: 2, rating: 4, comment: "Good mouse",     created_at: "2024-02-10 12:00:00" },
      { id: 3, user_id: 2, product_id: 3, rating: 3, comment: "Average lamp",   created_at: "2024-03-05 15:00:00" },
    ],
    sequence: 4,
  };

  // addresses → users.id: Alice and Bob have an address, Carol does not
  db.tables["addresses"] = {
    schema: {
      name: "addresses",
      columns: [
        { name: "id",      type: "SERIAL",  nullable: false, primaryKey: true },
        { name: "user_id", type: "INTEGER", nullable: false, primaryKey: false },
        { name: "street",  type: "VARCHAR", nullable: false, primaryKey: false },
        { name: "city",    type: "VARCHAR", nullable: false, primaryKey: false },
        { name: "country", type: "VARCHAR", nullable: false, primaryKey: false },
      ],
    },
    rows: [
      { id: 1, user_id: 1, street: "123 Main St",  city: "Bangkok",    country: "TH" },
      { id: 2, user_id: 2, street: "456 Oak Ave",  city: "Chiang Mai", country: "TH" },
    ],
    sequence: 3,
  };

  saveDB(db);
}
