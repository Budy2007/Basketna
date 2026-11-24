// End-to-end static checks for the Part 2 reference catalog and content modules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DEFAULT_SETTINGS, Meal, PriceObservation, Setting, Shop, Staple } from '../src/models/index.js';
import { DAY_NAMES, MONTHS, TEXT, UNITS_AR } from '../../client/src/i18n/text.js';
import { groupEmoji, mealEmoji } from '../../client/src/lib/art.js';

const catalog = JSON.parse(readFileSync(new URL('../../data/egypt_cairo.json', import.meta.url), 'utf8'));
const unique = (values) => new Set(values).size === values.length;

test('Cairo reference data includes the expected catalog counts', () => {
  assert.equal(catalog.shops.length, 12);
  assert.equal(catalog.staples.length, 44);
  assert.equal(catalog.meals.length, 53);
  assert.equal(catalog.observations.length, 654);
  assert.equal(catalog.targets.length, 5);
});

test('catalog keys and all shop, staple, and ingredient references are valid', () => {
  const shopKeys = new Set(catalog.shops.map((shop) => shop.key));
  const stapleKeys = new Set(catalog.staples.map((staple) => staple.key));

  assert.ok(unique(catalog.shops.map((shop) => shop.key)), 'shop keys must be unique');
  assert.ok(unique(catalog.staples.map((staple) => staple.key)), 'staple keys must be unique');
  assert.ok(unique(catalog.meals.map((meal) => meal.key)), 'meal keys must be unique');

  for (const meal of catalog.meals) {
    for (const ingredient of meal.ingredients) {
      assert.ok(stapleKeys.has(ingredient.staple), `unknown staple ${ingredient.staple} in ${meal.key}`);
      assert.ok(Number.isFinite(ingredient.qty) && ingredient.qty >= 0, `invalid quantity in ${meal.key}`);
    }
  }

  for (const observation of catalog.observations) {
    assert.ok(shopKeys.has(observation.shop), `unknown shop ${observation.shop}`);
    assert.ok(stapleKeys.has(observation.staple), `unknown staple ${observation.staple}`);
    assert.match(observation.observed_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(observation.pack_size > 0);
    assert.ok(observation.pack_price_egp >= 0.01);
  }
});

test('every supplied record satisfies its Mongoose model schema', () => {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    assert.equal(new Setting({ key, value }).validateSync(), undefined, `invalid setting ${key}`);
  }

  for (const shop of catalog.shops) {
    const doc = new Shop({
      key: shop.key,
      nameAr: shop.name_ar,
      nameEn: shop.name_en,
      kind: shop.kind,
      inComparison: Boolean(shop.in_comparison),
      website: shop.website,
      notes: shop.notes,
    });
    assert.equal(doc.validateSync(), undefined, `invalid shop ${shop.key}`);
  }

  for (const staple of catalog.staples) {
    const doc = new Staple({
      key: staple.key,
      nameAr: staple.name_ar,
      nameEn: staple.name_en,
      unit: staple.unit,
      foodGroup: staple.food_group,
      freshDays: staple.fresh_days,
      compare: staple.compare,
      gramsPerUnit: staple.grams_per_unit,
      nutrition: staple.nutrition,
      nutritionSource: staple.nutrition_source,
    });
    assert.equal(doc.validateSync(), undefined, `invalid staple ${staple.key}`);
  }

  for (const meal of catalog.meals) {
    const doc = new Meal({
      key: meal.key,
      nameAr: meal.name_ar,
      nameEn: meal.name_en,
      slot: meal.slot,
      sourceUrl: meal.source_url,
      ingredients: meal.ingredients,
    });
    assert.equal(doc.validateSync(), undefined, `invalid meal ${meal.key}`);
  }

  for (const observation of catalog.observations) {
    const doc = new PriceObservation({
      staple: observation.staple,
      shop: observation.shop,
      productTitle: observation.product_title,
      packSize: observation.pack_size,
      packPriceEgp: observation.pack_price_egp,
      unitPriceEgp: observation.pack_price_egp / observation.pack_size,
      isPromo: Boolean(observation.is_promo),
      observedOn: observation.observed_on,
      source: observation.source,
      sourceUrl: observation.source_url,
      notes: observation.notes,
    });
    assert.equal(doc.validateSync(), undefined, `invalid price observation ${observation.staple}/${observation.shop}/${observation.observed_on}`);
  }
});

test('every translation has Arabic and English text with complete calendar labels', () => {
  assert.equal(Object.keys(TEXT).length, 90);
  for (const [key, entry] of Object.entries(TEXT)) {
    assert.equal(typeof entry.ar, 'string', `missing Arabic text for ${key}`);
    assert.ok(entry.ar.length > 0, `empty Arabic text for ${key}`);
    assert.equal(typeof entry.en, 'string', `missing English text for ${key}`);
    assert.ok(entry.en.length > 0, `empty English text for ${key}`);
  }
  assert.equal(MONTHS.ar.length, 12);
  assert.equal(MONTHS.en.length, 12);
  assert.equal(DAY_NAMES.ar.length, 7);
  assert.equal(DAY_NAMES.en.length, 7);
  assert.ok(Object.keys(UNITS_AR).length > 0);
});

test('meal and food-group icon helpers include safe fallbacks', () => {
  assert.equal(mealEmoji({ key: 'ful_medames' }), '🥘');
  assert.equal(mealEmoji({ key: 'unknown', slot: 'lunch' }), '🍲');
  assert.equal(mealEmoji({ key: 'unknown', slot: 'unknown' }), '🍽️');
  assert.equal(groupEmoji('vegetables'), '🥬');
  assert.equal(groupEmoji('unknown'), '🛒');
});


test('price observations reject document and query edits or deletes', async () => {
  const existing = new PriceObservation({
    staple: 'rice',
    shop: 'carrefour_eg',
    packSize: 1,
    packPriceEgp: 40,
    unitPriceEgp: 40,
    observedOn: '2026-01-01',
    source: 'online',
  });
  existing.$isNew = false;

  await assert.rejects(existing.save(), /price observations are append-only/);
  await assert.rejects(existing.deleteOne(), /price observations are append-only/);

  const blockedOperations = [
    () => PriceObservation.updateOne({}, { $set: { packPriceEgp: 1 } }).exec(),
    () => PriceObservation.updateMany({}, { $set: { packPriceEgp: 1 } }).exec(),
    () => PriceObservation.findOneAndUpdate({}, { $set: { packPriceEgp: 1 } }).exec(),
    () => PriceObservation.findOneAndReplace({}, { packPriceEgp: 1 }).exec(),
    () => PriceObservation.replaceOne({}, { packPriceEgp: 1 }).exec(),
    () => PriceObservation.deleteOne({}).exec(),
    () => PriceObservation.deleteMany({}).exec(),
    () => PriceObservation.findOneAndDelete({}).exec(),
  ];

  for (const operation of blockedOperations) {
    await assert.rejects(operation(), /price observations are append-only/);
  }
});
