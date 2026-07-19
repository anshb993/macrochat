import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// --- Days ---
// One row per calendar day. dateKey is the stable lookup key (e.g. "2026-07-19")
// rather than relying on createdAt timestamps, which drift with timezones.
export const days = sqliteTable('days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dateKey: text('date_key').notNull().unique(), // "YYYY-MM-DD"
  createdAt: integer('created_at').notNull(), // unix ms
});

// --- Meals ---
// One row per logged message ("200g rice, 150g chicken").
// Stores the raw user input for debugging/re-parsing and for "undo".
export const meals = sqliteTable('meals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dayId: integer('day_id')
    .notNull()
    .references(() => days.id, { onDelete: 'cascade' }),
  rawInputText: text('raw_input_text').notNull(),
  totalCalories: real('total_calories').notNull().default(0),
  totalProtein: real('total_protein').notNull().default(0),
  totalCarbs: real('total_carbs').notNull().default(0),
  totalFat: real('total_fat').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

// --- FoodItems ---
// One row per individual food within a Meal.
// nutritionSourceId links back to the cached USDA lookup (Step 4).
export const foodItems = sqliteTable('food_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mealId: integer('meal_id')
    .notNull()
    .references(() => meals.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  grams: real('grams').notNull(),
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  nutritionSourceId: text('nutrition_source_id'), // USDA fdcId, nullable
});

// --- WeightLogs ---
export const weightLogs = sqliteTable('weight_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weightKg: real('weight_kg').notNull(),
  loggedAt: integer('logged_at').notNull(),
});

// --- Settings ---
// Single-row table. We enforce singleton at the repository level (Step 3),
// not in the schema itself — SQLite has no clean "max 1 row" constraint.
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  useMetricUnits: integer('use_metric_units', { mode: 'boolean' }).notNull().default(true),
  darkMode: integer('dark_mode', { mode: 'boolean' }).notNull().default(true),
});

// --- Goals ---
// Versioned, not single-row: if the user changes their goal mid-month,
// past days should still show against the goal that was active then.
export const goals = sqliteTable('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  calorieTarget: integer('calorie_target').notNull(),
  proteinTarget: integer('protein_target').notNull(),
  carbTarget: integer('carb_target').notNull(),
  fatTarget: integer('fat_target').notNull(),
  effectiveFrom: integer('effective_from').notNull(), // unix ms
});

// --- Relations (for Drizzle's relational query API) ---
export const daysRelations = relations(days, ({ many }) => ({
  meals: many(meals),
}));

export const mealsRelations = relations(meals, ({ one, many }) => ({
  day: one(days, { fields: [meals.dayId], references: [days.id] }),
  foodItems: many(foodItems),
}));

export const foodItemsRelations = relations(foodItems, ({ one }) => ({
  meal: one(meals, { fields: [foodItems.mealId], references: [meals.id] }),
}));