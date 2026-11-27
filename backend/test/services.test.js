import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import mongoose from 'mongoose';
import { DEFAULT_SETTINGS, PriceObservation } from '../src/models/index.js';
import { ensureSettings, getSettings, loadMeals } from '../src/services/catalog.service.js';
import { cheapestCards, galleryCards } from '../src/services/meal.service.js';
import { analyze, parsePeople, parsePlan, planningInputs } from '../src/services/planner.service.js';
import { currentEstimates, priceTable } from '../src/services/price.service.js';
import { loadSeed } from '../src/services/seed.service.js';
import { shopSummaries } from '../src/services/shop.service.js';

test('plan input keeps known meals in their own slots and clamps household size', () => {
  const meals = { ful: { slot: 'breakfast' }, rice: { slot: 'lunch' } };
  assert.deepEqual(parsePlan({ d0_breakfast: 'ful', d1_lunch: 'rice', d2_dinner: 'ful', d3_lunch: 'unknown', d7_lunch: 'rice' }, meals),
    { '0|breakfast': 'ful', '1|lunch': 'rice' });
  assert.equal(parsePeople('0', 4), 1);
  assert.equal(parsePeople('21', 4), 20);
  assert.equal(parsePeople('', 4), 4);
});

const uri = process.env.TEST_MONGO_URI;
test('feature services work together with the Cairo seed', { skip: !uri }, async (t) => {
  assert.match(uri, /\/[^/?]+_test(?:\?|$)/, 'use a dedicated database ending in _test');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await mongoose.connection.dropDatabase();
    await ensureSettings();
    const seedPath = new URL('../../data/egypt_cairo.json', import.meta.url);
    const seed = JSON.parse(await readFile(seedPath, 'utf8'));
    const today = seed.observations.map((o) => o.observed_on).sort().at(-1);

    await t.test('seed loads 654 observations and repeat loads add none', async () => {
      assert.deepEqual(await loadSeed(seedPath), { shops: 12, staples: 44, meals: 53, newObservations: 654 });
      assert.equal((await loadSeed(seedPath)).newObservations, 0);
      assert.equal(await PriceObservation.countDocuments(), 654);
      assert.deepEqual(await getSettings(), DEFAULT_SETTINGS);
    });

    await t.test('price table and shop summaries agree with the observation log', async () => {
      const estimates = await currentEstimates(today);
      const table = await priceTable(today);
      assert.ok(estimates.size > 0);
      assert.deepEqual(table.estimates, Object.fromEntries(estimates));
      assert.equal(table.shops.length + table.references.length, 12);
      const summaries = await shopSummaries();
      assert.equal(summaries.reduce((sum, shop) => sum + shop.prices, 0), 654);
      for (const shop of summaries) {
        const dates = seed.observations.filter((o) => o.shop === shop.key).map((o) => o.observed_on).sort();
        assert.equal(shop.latest, dates.at(-1) ?? null);
      }
    });

    await t.test('gallery filters names and slots, sorts costs and handles unknown sorts', async () => {
      const all = await galleryCards({}, today);
      assert.equal(all.cards.length, 53);
      const first = all.cards[0].meal;
      const filtered = await galleryCards({ slot: first.slot, q: first.nameEn.toUpperCase() }, today);
      assert.ok(filtered.cards.some((c) => c.meal.key === first.key));
      assert.ok(filtered.cards.every((c) => c.meal.slot === first.slot));
      assert.equal((await galleryCards({ sort: 'constructor' }, today)).sort, 'cheapest');
      const cheapest = await cheapestCards(today);
      assert.equal(cheapest.length, 4);
      assert.ok(cheapest.every((c) => Number.isFinite(c.bestCost)));
      assert.ok(cheapest.every((c, i) => i === 0 || c.bestCost >= cheapest[i - 1].bestCost));
    });

    await t.test('planner scales servings and produces priced baskets with outside staples separate', async () => {
      const meals = await loadMeals();
      const meal = Object.values(meals)[0];
      const plan = parsePlan({ [`d0_${meal.slot}`]: meal.key }, meals);
      const one = await analyze(plan, 1, today);
      const two = await analyze(plan, 2, today);
      assert.deepEqual(two.plan, plan);
      assert.ok(two.totals.length > 0);
      for (const [key, qty] of Object.entries(one.qty)) assert.equal(two.qty[key], qty * 2);
      assert.ok(two.outside.every((line) => !(line.staple in two.qty)));
      assert.ok(two.totals.every((shop) => Number.isFinite(shop.total)));
      assert.equal((await analyze({}, 2, today)).recommendation.kind, 'empty');
      const inputs = await planningInputs(today);
      assert.equal(Object.keys(inputs.nutrition).length, 53);
      assert.ok(Object.values(inputs.nutrition).every((n) => Number.isFinite(n.kcal)));
    });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
