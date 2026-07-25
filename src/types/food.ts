import type { foodItems } from '../db/schema';

export type NewFoodItem = typeof foodItems.$inferInsert;

export interface ExtractedFood {
  name: string;
  grams: number;
}

export interface ExtractionResult {
  foods: ExtractedFood[];
  isEdit: boolean;
  editType?: 'remove' | 'update' | 'replace' | 'undo';
  editTarget?: string;
}