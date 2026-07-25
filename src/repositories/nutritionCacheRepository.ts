import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { nutritionCache } from '../db/schema';
import type { NewNutritionCacheEntry } from '../types/nutrition';

export const nutritionCacheRepository = {
  async findByName(normalizedName: string) {
    return db.query.nutritionCache.findFirst({
      where: eq(nutritionCache.normalizedName, normalizedName),
    });
  },

  async upsert(entry: NewNutritionCacheEntry) {
    const existing = await this.findByName(entry.normalizedName);
    if (existing) {
      await db
        .update(nutritionCache)
        .set(entry)
        .where(eq(nutritionCache.normalizedName, entry.normalizedName));
      return;
    }
    await db.insert(nutritionCache).values(entry);
  },
};