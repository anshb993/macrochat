import { eq, sum } from 'drizzle-orm';
import { db } from '../db/client';
import { meals, foodItems } from '../db/schema';
import type { NewMeal } from '../types/meal';

export const mealsRepository = {
  async create(meal: NewMeal) {
    const [inserted] = await db.insert(meals).values(meal).returning();
    return inserted;
  },

  async recalculateTotals(mealId: number) {
    const [totals] = await db
      .select({
        calories: sum(foodItems.calories),
        protein: sum(foodItems.protein),
        carbs: sum(foodItems.carbs),
        fat: sum(foodItems.fat),
      })
      .from(foodItems)
      .where(eq(foodItems.mealId, mealId));

    await db
      .update(meals)
      .set({
        totalCalories: Number(totals?.calories ?? 0),
        totalProtein: Number(totals?.protein ?? 0),
        totalCarbs: Number(totals?.carbs ?? 0),
        totalFat: Number(totals?.fat ?? 0),
      })
      .where(eq(meals.id, mealId));
  },

  async remove(id: number) {
    // foodItems cascade-delete via the FK in schema.ts (onDelete: 'cascade')
    await db.delete(meals).where(eq(meals.id, id));
  },

  async listByDay(dayId: number) {
    return db.query.meals.findMany({
      where: eq(meals.dayId, dayId),
      with: { foodItems: true },
    });
  },
};