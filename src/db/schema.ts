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
  // 2: how the user corrected the AI's photo analysis; recent ones are sent with each new photo so it learns.
  `
  CREATE TABLE ai_corrections (${SYNC},
    food_log_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('grams','removed','missed')),
    name TEXT NOT NULL,
    ai_grams REAL,
    grams REAL
  );
  `,
  // 3: foods the user has at home right now (feeds "What should I eat?").
  `ALTER TABLE foods ADD COLUMN at_home INTEGER NOT NULL DEFAULT 0;`,
  // 4: how much of an at-home food is left, in grams (null = not limited).
  `ALTER TABLE foods ADD COLUMN home_grams REAL;`,
  // 5: counted foods (grams per piece, e.g. an egg ≈ 50 g) and a per-day cap the suggestions respect (grams).
  `
  ALTER TABLE foods ADD COLUMN piece_grams REAL;
  ALTER TABLE foods ADD COLUMN daily_max_grams REAL;
  UPDATE foods SET piece_grams = 50 WHERE name LIKE '%egg%';
  `,
  // 6: smallest portion worth suggesting (grams) and foods this one is only eaten with (JSON array of food ids).
  `
  ALTER TABLE foods ADD COLUMN min_grams REAL;
  ALTER TABLE foods ADD COLUMN pairs_with TEXT NOT NULL DEFAULT '[]';
  `,
  // 7: history of At home amounts (eaten, bought, edited by hand…), newest shown first on At home → Changes.
  `
  CREATE TABLE stock_changes (${SYNC},
    food_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('eaten','edited','returned','bought','manual')),
    before_grams REAL,
    after_grams REAL,
    changed_at TEXT NOT NULL
  );
  CREATE INDEX stock_changes_at ON stock_changes (changed_at);
  `,
  // 8: foods switched off in My Diet (kept, but left out of suggestions, shopping, At home and photo matching).
  `ALTER TABLE foods ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;`,
  // 9: steps per local day, copied from Health Connect (id = the date, "YYYY-MM-DD").
  `CREATE TABLE daily_steps (${SYNC},
    steps INTEGER NOT NULL
  );`,
  // 10: a workout's own name (its template's, or the workout name from a Strong import).
  `ALTER TABLE workouts ADD COLUMN name TEXT;`,
];
