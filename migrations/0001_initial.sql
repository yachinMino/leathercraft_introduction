PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS master_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (
    category IN ('leatherColor', 'grain', 'threadColor', 'edgeFinish', 'tanningMethod')
  ),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_options_category_label
  ON master_options (category, label);

CREATE INDEX IF NOT EXISTS idx_master_options_category_sort
  ON master_options (category, sort_order, id);

CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  leather_color TEXT NOT NULL,
  grain TEXT NOT NULL,
  thread_color TEXT NOT NULL,
  tanning_method TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_edge_finishes (
  work_id INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  edge_finish TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (work_id, edge_finish)
);

CREATE INDEX IF NOT EXISTS idx_work_edge_finishes_work_sort
  ON work_edge_finishes (work_id, sort_order);

CREATE TABLE IF NOT EXISTS work_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  image_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_images_work_sort
  ON work_images (work_id, sort_order);

CREATE TABLE IF NOT EXISTS work_reactions (
  work_id INTEGER NOT NULL REFERENCES works (id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'request')),
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (work_id, reaction_type, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_work_reactions_work_type
  ON work_reactions (work_id, reaction_type);

INSERT INTO master_options (category, label, sort_order)
VALUES
  ('leatherColor', 'ナチュラル', 0),
  ('leatherColor', 'ブラック', 1),
  ('leatherColor', 'ダークブラウン', 2),
  ('leatherColor', 'ブラウン', 3),
  ('leatherColor', 'キャメル', 4),
  ('leatherColor', 'ネイビー', 5),
  ('leatherColor', 'グリーン', 6),
  ('leatherColor', 'ボルドー', 7),
  ('grain', '型押し', 0),
  ('grain', 'あり', 1),
  ('grain', 'なし', 2),
  ('threadColor', '黒', 0),
  ('threadColor', '白', 1),
  ('threadColor', '茶色', 2),
  ('edgeFinish', 'ヘリ落とし', 0),
  ('edgeFinish', 'バスコ', 1),
  ('edgeFinish', 'ヘリ磨き', 2),
  ('edgeFinish', 'ヘリ漉き', 3),
  ('tanningMethod', 'タンニン鞣し', 0),
  ('tanningMethod', 'クロム鞣し', 1),
  ('tanningMethod', 'コンビ鞣し', 2)
ON CONFLICT(category, label) DO NOTHING;
