import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import type { ExtractionResult } from '../types/food';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set in .env');
}

const genAI = new GoogleGenerativeAI(apiKey);

// Forces the model into a strict shape — no calories/macros fields exist
// here, so the model has no way to "invent" nutrition values even if
// prompted badly. This is enforced by the API, not just instructions.
const extractionSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        foods: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    name: { type: SchemaType.STRING },
                    grams: { type: SchemaType.NUMBER },
                },
                required: ['name', 'grams'],
            },
        },
        isEdit: { type: SchemaType.BOOLEAN },
        eeditType: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['remove', 'update', 'replace', 'undo'],
        },
        editTarget: { type: SchemaType.STRING },
    },
    required: ['foods', 'isEdit'],
};

const SYSTEM_INSTRUCTION = `You extract food names and quantities in grams from casual, conversational text about meals.

Rules:
- Convert all quantities to grams. If given in a common unit (e.g. "1 banana", "2 eggs", "1 cup rice"), estimate a standard gram equivalent.
- Never output calorie, protein, carb, or fat values — that is not your job, only extract name and grams.
- If the message is an edit to a previous meal (e.g. "remove rice", "change chicken to 250 grams", "replace chicken with fish", "undo"), set isEdit to true and fill editType/editTarget instead of populating foods with new items.
- If the message is a fresh food log, set isEdit to false and leave editType/editTarget empty.
- Normalize food names to a clean, singular form (e.g. "Chicken Breast", not "chicken breasts").`;

export const geminiService = {
    async extractFoods(rawText: string): Promise<ExtractionResult> {
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: extractionSchema,
            },
        });

        const result = await model.generateContent(rawText);
        const parsed = JSON.parse(result.response.text()) as ExtractionResult;

        return parsed;
    },
};