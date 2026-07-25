import type { nutritionCache } from '../db/schema';

export type NewNutritionCacheEntry = typeof nutritionCache.$inferInsert;

export interface ResolvedNutrition {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutritionSourceId: string;
}