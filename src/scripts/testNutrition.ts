import 'dotenv/config';

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY;
const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const DETAIL_URL = 'https://api.nal.usda.gov/fdc/v1/food';

const NUTRIENT_IDS = { PROTEIN: 1003, CARBS: 1005, FAT: 1004 };

const EXCLUDED_CATEGORIES = [
  'bratwurst', 'sausage', 'hot dog', 'giblets', 'liver', 'gizzard', 'heart',
  'neck', 'feet', 'patty', 'nugget', 'breaded', 'lunchmeat',
  'glutinous', 'fried', 'instant', 'canned', 'dehydrated', 'frozen',
];

const GENERIC_FOOD_DEFAULTS: Record<string, string> = {
  chicken: 'chicken breast boneless skinless',
  'chicken breast': 'chicken breast boneless skinless',
  beef: 'beef ground 90% lean',
  fish: 'salmon fillet',
  pork: 'pork loin',
};

type CookState = 'raw' | 'cooked' | 'unspecified';

function applyGenericDefaults(foodName: string): string {
  const lower = foodName.trim().toLowerCase();
  return GENERIC_FOOD_DEFAULTS[lower] ?? foodName;
}

function detectRequestedState(foodName: string): CookState {
  const lower = foodName.toLowerCase();
  if (/\b(raw|uncooked)\b/.test(lower)) return 'raw';
  if (/\b(cooked|grilled|boiled|roasted|fried|steamed|baked)\b/.test(lower)) return 'cooked';
  return 'unspecified';
}

function buildSearchQuery(foodName: string): { query: string; state: CookState } {
  const resolvedName = applyGenericDefaults(foodName);
  const state = detectRequestedState(resolvedName);
  if (state !== 'unspecified') return { query: resolvedName, state };
  return { query: `${resolvedName} cooked`, state: 'cooked' };
}

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

function extractEnergy(nutrients: any[]): number {
  const direct = nutrients.find((n) => n.nutrient?.id === 1008);
  if (direct?.amount) return direct.amount;
  const atwaterGeneral = nutrients.find((n) => n.nutrient?.id === 2047);
  if (atwaterGeneral?.amount) return atwaterGeneral.amount;
  const atwaterSpecific = nutrients.find((n) => n.nutrient?.id === 2048);
  return atwaterSpecific?.amount ?? 0;
}

function extractNutrient(nutrients: any[], nutrientId: number): number {
  return nutrients.find((n) => n.nutrient?.id === nutrientId)?.amount ?? 0;
}

async function testFood(rawName: string) {
  const { query, state } = buildSearchQuery(rawName);
  const searchParams = new URLSearchParams({
    api_key: USDA_API_KEY ?? '',
    query,
    dataType: 'Foundation,SR Legacy',
    pageSize: '5',
  });

  const searchRes = await fetch(`${SEARCH_URL}?${searchParams.toString()}`);
  const searchData = await searchRes.json();

  console.log(`\n=== "${rawName}" (query: "${query}", state: ${state}) ===`);
  searchData.foods.forEach((f: any, i: number) => console.log(`  [${i}] "${f.description}"`));

  const chosen = pickBestCandidate(searchData.foods, rawName, state);
  console.log(`Picked: "${chosen.description}"`);

  const detailRes = await fetch(`${DETAIL_URL}/${chosen.fdcId}?api_key=${USDA_API_KEY}`);
  const detail = await detailRes.json();
  const nutrients = detail.foodNutrients;

  console.log('Calories/100g:', extractEnergy(nutrients));
  console.log('Protein/100g:', extractNutrient(nutrients, NUTRIENT_IDS.PROTEIN));
  console.log('Carbs/100g:', extractNutrient(nutrients, NUTRIENT_IDS.CARBS));
  console.log('Fat/100g:', extractNutrient(nutrients, NUTRIENT_IDS.FAT));
}

async function main() {
  await testFood('White rice');
  await testFood('Chicken');
  await testFood('Beef');
  await testFood('Chicken breast');
}

main();