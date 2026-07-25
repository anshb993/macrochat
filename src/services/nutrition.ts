import { nutritionCacheRepository } from '../repositories/nutritionCacheRepository';
import type { ExtractedFood } from '../types/food';
import type { ResolvedNutrition } from '../types/nutrition';

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY;
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const USDA_DETAIL_URL = 'https://api.nal.usda.gov/fdc/v1/food';

const NUTRIENT_IDS = {
  ENERGY: 1008,
  ENERGY_ATWATER_GENERAL: 2047,
  ENERGY_ATWATER_SPECIFIC: 2048,
  PROTEIN: 1003,
  CARBS: 1005,
  FAT: 1004,
};

// Records containing these terms get excluded unless the user's original
// input already mentioned them. Prevents "chicken" resolving to bratwurst,
// giblets, or "rice" resolving to glutinous rice, etc.
const EXCLUDED_CATEGORIES = [
  'bratwurst',
  'sausage',
  'hot dog',
  'giblets',
  'liver',
  'gizzard',
  'heart',
  'neck',
  'feet',
  'patty',
  'nugget',
  'breaded',
  'lunchmeat',
  'glutinous',
  'fried',
  'instant',
  'canned',
  'dehydrated',
  'frozen',
];

// Maps vague, commonly-tracked foods to the specific cut/form most fitness
// users actually mean, when the user didn't specify one. This is a small,
// hand-picked list, not a general solution — grow it as new ambiguous foods
// come up in testing.
const GENERIC_FOOD_DEFAULTS: Record<string, string> = {
  chicken: 'chicken breast boneless skinless',
  'chicken breast': 'chicken breast boneless skinless',
  beef: 'beef ground 90% lean',
  fish: 'salmon fillet',
  pork: 'pork loin',
};

type CookState = 'raw' | 'cooked' | 'unspecified';

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function applyGenericDefaults(foodName: string): string {
  const lower = normalize(foodName);
  return GENERIC_FOOD_DEFAULTS[lower] ?? foodName;
}

function detectRequestedState(foodName: string): CookState {
  const lower = foodName.toLowerCase();
  if (/\b(raw|uncooked)\b/.test(lower)) return 'raw';
  if (/\b(cooked|grilled|boiled|roasted|fried|steamed|baked)\b/.test(lower)) return 'cooked';
  return 'unspecified';
}

// Builds the USDA search query. Defaults to "cooked" when the user didn't
// specify a state — most people tracking macros weigh food after cooking.
function buildSearchQuery(foodName: string): { query: string; state: CookState } {
  const resolvedName = applyGenericDefaults(foodName);
  const state = detectRequestedState(resolvedName);

  if (state !== 'unspecified') {
    return { query: resolvedName, state };
  }
  return { query: `${resolvedName} cooked`, state: 'cooked' };
}

// Selects the best candidate from USDA search results. Search relevance
// ranking cannot be trusted alone — it has ranked raw records highest even
// when "cooked" was in the query, so raw/cooked and skin-on/skinless are
// enforced here as hard filters rather than left to ranking.
function pickBestCandidate(candidates: any[], originalFoodName: string, requestedState: CookState): any {
  const lowerOriginal = originalFoodName.toLowerCase();
  const userMentionedSkin = /\bskin\b/.test(lowerOriginal);

  const categoryFiltered = candidates.filter((c) => {
    const desc = c.description.toLowerCase();
    return EXCLUDED_CATEGORIES.every((term) => !desc.includes(term) || lowerOriginal.includes(term));
  });

  const stateFiltered = categoryFiltered.filter((c) => {
    const desc = c.description.toLowerCase();
    if (requestedState === 'cooked') return !desc.includes('raw');
    if (requestedState === 'raw') return desc.includes('raw');
    return true;
  });

  const skinFiltered = stateFiltered.filter((c) => {
    const desc = c.description.toLowerCase();
    if (userMentionedSkin) return true;
    return !desc.includes('meat and skin') && !desc.includes('with skin');
  });

  return skinFiltered[0] ?? stateFiltered[0] ?? categoryFiltered[0] ?? candidates[0];
}

// Handles the Atwater-factor fallback: some Foundation Foods records store
// energy under a computed Atwater ID (2047/2048) instead of the direct
// measured value (1008).
function extractEnergy(nutrients: any[]): number {
  const direct = nutrients.find((n) => n.nutrient?.id === NUTRIENT_IDS.ENERGY);
  if (direct?.amount) return direct.amount;

  const atwaterGeneral = nutrients.find((n) => n.nutrient?.id === NUTRIENT_IDS.ENERGY_ATWATER_GENERAL);
  if (atwaterGeneral?.amount) return atwaterGeneral.amount;

  const atwaterSpecific = nutrients.find((n) => n.nutrient?.id === NUTRIENT_IDS.ENERGY_ATWATER_SPECIFIC);
  return atwaterSpecific?.amount ?? 0;
}

function extractNutrient(nutrients: any[], nutrientId: number): number {
  return nutrients.find((n) => n.nutrient?.id === nutrientId)?.amount ?? 0;
}

// Two-step lookup: search returns an abridged nutrient set (often missing
// basic macros entirely), so we fetch full detail by fdcId to get reliable
// calorie/protein/carb/fat values.
async function fetchFromUsda(foodName: string) {
  const { query: searchQuery, state } = buildSearchQuery(foodName);

  const searchParams = new URLSearchParams({
    api_key: USDA_API_KEY ?? '',
    query: searchQuery,
    dataType: 'Foundation,SR Legacy', // excludes Branded — inconsistent per-serving units, not per-100g
    pageSize: '5',
  });

  const searchRes = await fetch(`${USDA_SEARCH_URL}?${searchParams.toString()}`);
  if (!searchRes.ok) {
    throw new Error(`USDA search error: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  if (!searchData.foods?.length) {
    throw new Error(`No USDA match found for "${foodName}" (query: "${searchQuery}")`);
  }

  const bestMatch = pickBestCandidate(searchData.foods, foodName, state);

  const detailRes = await fetch(`${USDA_DETAIL_URL}/${bestMatch.fdcId}?api_key=${USDA_API_KEY}`);
  if (!detailRes.ok) {
    throw new Error(`USDA detail fetch error: ${detailRes.status}`);
  }

  const detail = await detailRes.json();
  const nutrients = detail.foodNutrients;

  return {
    fdcId: String(bestMatch.fdcId),
    caloriesPer100g: extractEnergy(nutrients),
    proteinPer100g: extractNutrient(nutrients, NUTRIENT_IDS.PROTEIN),
    carbsPer100g: extractNutrient(nutrients, NUTRIENT_IDS.CARBS),
    fatPer100g: extractNutrient(nutrients, NUTRIENT_IDS.FAT),
  };
}

export const nutritionService = {
  async resolve(food: ExtractedFood): Promise<ResolvedNutrition> {
    const normalizedName = normalize(food.name);

    let per100g = await nutritionCacheRepository.findByName(normalizedName);

    if (!per100g) {
      const fetched = await fetchFromUsda(food.name);
      await nutritionCacheRepository.upsert({
        normalizedName,
        ...fetched,
        cachedAt: Date.now(),
      });
      per100g = { ...fetched, id: 0, normalizedName, cachedAt: Date.now() };
    }

    const scale = food.grams / 100;

    return {
      name: food.name,
      grams: food.grams,
      calories: per100g.caloriesPer100g * scale,
      protein: per100g.proteinPer100g * scale,
      carbs: per100g.carbsPer100g * scale,
      fat: per100g.fatPer100g * scale,
      nutritionSourceId: per100g.fdcId,
    };
  },
};