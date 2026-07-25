import type { goals } from '../db/schema';

export type NewGoal = typeof goals.$inferInsert;