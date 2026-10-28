// Local SQLite schema. Each entry is one migration; append new ones, never edit old ones.
// No FOREIGN KEY constraints on purpose: sync can deliver a child row before its parent.

// Columns every synced table carries (see plan.md §2 and §5).
const SYNC = `
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 1`;

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE profile (${SYNC},
    sex TEXT CHECK (sex IN ('male','female')),
    birth_date TEXT,
    height_cm REAL,
    activity_level REAL,
    goal TEXT CHECK (goal IN ('lose','gain','maintain')),
    goal_weight_kg REAL,
    rate_kg_week REAL,
    protein_g_per_lb REAL,
    carb_ratio REAL,
    calorie_override INTEGER
  );

  CREATE TABLE weight_logs (${SYNC},
    date TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    UNIQUE (user_id, date)
  );

  CREATE TABLE foods (${SYNC},
    name TEXT NOT NULL,
    kcal_100g REAL NOT NULL,
    protein_100g REAL NOT NULL,
    carbs_100g REAL NOT NULL,
    fat_100g REAL NOT NULL,
    default_grams REAL,
    source TEXT CHECK (source IN ('usda','off','manual')),
    source_id TEXT,
    barcode TEXT,
    shop_unit TEXT,
    shop_qty REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE meals (${SYNC},
    name TEXT NOT NULL,
    ref_photo_paths TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE meal_items (${SYNC},
    meal_id TEXT NOT NULL,
    food_id TEXT NOT NULL,
    grams REAL NOT NULL
  );
  CREATE INDEX meal_items_meal ON meal_items (meal_id);

  CREATE TABLE food_logs (${SYNC},
    logged_at TEXT NOT NULL,
    meal_id TEXT,
    photo_path TEXT,
    source TEXT NOT NULL CHECK (source IN ('photo','quick'))
  );
  CREATE INDEX food_logs_logged_at ON food_logs (logged_at);

  CREATE TABLE food_log_items (${SYNC},
    food_log_id TEXT NOT NULL,
    food_id TEXT,
    name TEXT NOT NULL,
    grams REAL NOT NULL,
    kcal REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    verified INTEGER NOT NULL
  );
  CREATE INDEX food_log_items_log ON food_log_items (food_log_id);

  CREATE TABLE exercises (${SYNC},
    name TEXT NOT NULL,
    primary_muscle TEXT,
    equipment TEXT,
    image_path TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0,
    default_rest_s INTEGER NOT NULL DEFAULT 120
  );

  CREATE TABLE templates (${SYNC},
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE template_exercises (${SYNC},
    template_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    rest_s INTEGER NOT NULL
  );
  CREATE INDEX template_exercises_template ON template_exercises (template_id);

  CREATE TABLE template_sets (${SYNC},
    template_exercise_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    reps INTEGER,
    weight_kg REAL,
    is_warmup INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX template_sets_te ON template_sets (template_exercise_id);

  CREATE TABLE workouts (${SYNC},
    template_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT
  );

  CREATE TABLE workout_sets (${SYNC},
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    exercise_order INTEGER NOT NULL,
    set_order INTEGER NOT NULL,
    weight_kg REAL,
    reps INTEGER,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );
  CREATE INDEX workout_sets_workout ON workout_sets (workout_id);
  CREATE INDEX workout_sets_exercise ON workout_sets (exercise_id, completed_at);
  `,
];
