const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

const db = new Database("library.db");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0)
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  return_date TEXT,
  returned INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function available(bookId) {
  const book = db.prepare("SELECT quantity FROM books WHERE id=?").get(bookId);
  const row = db.prepare(
    "SELECT COUNT(*) AS count FROM issues WHERE book_id=? AND returned=0"
  ).get(bookId);
  return book ? book.quantity - row.count : 0;
}

/* DASHBOARD */
app.get("/api/stats", (req, res) => {
  const total = db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM books").get().n;
  const issued = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE returned=0").get().n;
  const members = db.prepare("SELECT COUNT(*) AS n FROM members").get().n;
  res.json({ totalBooks: total, availableBooks: total - issued, issuedBooks: issued, members });
});

/* BOOKS */
app.get("/api/books", (req, res) => {
  const q = `%${(req.query.search || "").trim()}%`;
  const books = db.prepare(`
    SELECT b.*,
      b.quantity - (
        SELECT COUNT(*) FROM issues i
        WHERE i.book_id=b.id AND i.returned=0
      ) AS available
    FROM books b
    WHERE b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?
    ORDER BY b.id DESC
  `).all(q, q, q);
  res.json(books);
});

app.post("/api/books", (req, res) => {
  const { title, author, isbn, category, quantity } = req.body;
  if (!title || !author || !isbn || !category || !Number.isInteger(quantity) || quantity < 1)
    return res.status(400).json({ error: "All fields are required and quantity must be positive." });

  try {
    const result = db.prepare(
      "INSERT INTO books(title,author,isbn,category,quantity) VALUES(?,?,?,?,?)"
    ).run(title.trim(), author.trim(), isbn.trim(), category.trim(), quantity);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: "ISBN already exists." });
  }
});

app.put("/api/books/:id", (req, res) => {
  const { title, author, isbn, category, quantity } = req.body;
  if (!title || !author || !isbn || !category || !Number.isInteger(quantity) || quantity < 1)
    return res.status(400).json({ error: "Invalid book data." });

  try {
    db.prepare(`
      UPDATE books SET title=?,author=?,isbn=?,category=?,quantity=? WHERE id=?
    `).run(title.trim(), author.trim(), isbn.trim(), category.trim(), quantity, req.params.id);
    res.json({ message: "Book updated." });
  } catch (e) {
    res.status(400).json({ error: "Could not update book. ISBN may already exist." });
  }
});

app.delete("/api/books/:id", (req, res) => {
  const active = db.prepare(
    "SELECT COUNT(*) AS n FROM issues WHERE book_id=? AND returned=0"
  ).get(req.params.id).n;
  if (active > 0) return res.status(400).json({ error: "Return active copies before deleting this book." });
  db.prepare("DELETE FROM books WHERE id=?").run(req.params.id);
  res.json({ message: "Book deleted." });
});

/* MEMBERS */
app.get("/api/members", (req, res) => {
  res.json(db.prepare("SELECT * FROM members ORDER BY id DESC").all());
});

app.post("/api/members", (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email || !phone)
    return res.status(400).json({ error: "All member fields are required." });
  try {
    const result = db.prepare(
      "INSERT INTO members(name,email,phone) VALUES(?,?,?)"
    ).run(name.trim(), email.trim().toLowerCase(), phone.trim());
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: "A member with this email already exists." });
  }
});

/* ISSUE / RETURN */
app.get("/api/issues", (req, res) => {
  res.json(db.prepare(`
    SELECT i.*, b.title AS book_title, m.name AS member_name
    FROM issues i
    JOIN books b ON b.id=i.book_id
    JOIN members m ON m.id=i.member_id
    ORDER BY i.id DESC
  `).all());
});

app.post("/api/issues", (req, res) => {
  const { member_id, book_id } = req.body;
  if (!member_id || !book_id)
    return res.status(400).json({ error: "Select a member and book." });

  if (available(book_id) <= 0)
    return res.status(400).json({ error: "No copy of this book is available." });

  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(
    "INSERT INTO issues(member_id,book_id,issue_date) VALUES(?,?,?)"
  ).run(member_id, book_id, today);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.put("/api/issues/:id/return", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(
    "UPDATE issues SET returned=1, return_date=? WHERE id=? AND returned=0"
  ).run(today, req.params.id);

  if (!result.changes) return res.status(400).json({ error: "Issue record not found or already returned." });
  res.json({ message: "Book returned successfully." });
});

app.listen(PORT, () => {
  console.log(`Library Management System running at http://localhost:${PORT}`);
});