import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { foodItems } from '../db/schema';
import { mealsRepository } from './mealsRepository';
import type { NewFoodItem } from '../types/food';

export const foodItemsRepository = {
  async create(item: NewFoodItem) {
    const [inserted] = await db.insert(foodItems).values(item).returning();
    await mealsRepository.recalculateTotals(item.mealId);
    return inserted;
  },

  async update(id: number, mealId: number, changes: Partial<NewFoodItem>) {
    await db.update(foodItems).set(changes).where(eq(foodItems.id, id));
    await mealsRepository.recalculateTotals(mealId);
  },

  async remove(id: number, mealId: number) {
    await db.delete(foodItems).where(eq(foodItems.id, id));
    await mealsRepository.recalculateTotals(mealId);
  },

  async listByMeal(mealId: number) {
    return db.query.foodItems.findMany({
      where: eq(foodItems.mealId, mealId),
    });
  },
};