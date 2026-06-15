This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started
สิ่งที่มีในโปรเจกต์
Engine (app/lib/pgSimulator.ts) — จำลอง PostgreSQL ครบ:

Command	ตัวอย่าง
CREATE TABLE	CREATE TABLE orders (id SERIAL PRIMARY KEY, total NUMERIC)
DROP TABLE	DROP TABLE orders
TRUNCATE	TRUNCATE TABLE users
INSERT INTO	INSERT INTO users (name, email) VALUES ('Alice', 'a@b.com')
SELECT	SELECT * FROM users WHERE age > 25 ORDER BY name LIMIT 5
UPDATE	UPDATE users SET age = 30 WHERE id = 1
DELETE FROM	DELETE FROM users WHERE id = 3
ALTER TABLE	ALTER TABLE users ADD COLUMN phone VARCHAR
\dt	แสดงทุก table
\d tablename	แสดง schema
UI Features:

🗃️ ข้อมูล seed พร้อม — ตาราง users และ products
⌨️ Ctrl+Enter รัน query
📋 Sidebar snippets คลิกได้เลย
📜 History tab — ดูทุก query ที่รัน + กด reuse
🗂️ Schema tab — ดู structure ทุกตาราง
💾 เก็บข้อมูลใน localStorage — ไม่หายแม้ refresh

Pg simulator
ZIP 


