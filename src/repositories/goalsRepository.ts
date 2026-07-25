import { desc, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { goals } from '../db/schema';
import type { NewGoal } from '../types/goal';

export const goalsRepository = {
  async setNewGoal(goal: NewGoal) {
    // Never update in place — always insert a new versioned row.
    const [inserted] = await db.insert(goals).values(goal).returning();
    return inserted;
  },

  async getActiveGoalForDate(timestampMs: number) {
    return db.query.goals.findFirst({
      where: lte(goals.effectiveFrom, timestampMs),
      orderBy: desc(goals.effectiveFrom),
    });
  },
};