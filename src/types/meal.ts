import type { meals } from '../db/schema';

export type NewMeal = typeof meals.$inferInsert;