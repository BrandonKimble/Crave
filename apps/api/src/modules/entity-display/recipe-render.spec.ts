import { conceptCase, recipeConceptId, renderRecipe } from './recipe-render';
import { MESSAGE_CATALOGUES_FOR_TEST, renderMessage } from './recipe-messages';

describe('N6 render-from-recipe', () => {
  const ctx = {
    cityName: 'Austin',
    conceptLabel: 'Tacos',
    rotationKey: '2026-07',
  };

  it("reproduces TODAY'S English strings verbatim (the move must be invisible)", () => {
    expect(renderRecipe('cuisine_best:abc', 'en', ctx)).toEqual({
      title: 'Best Tacos in Austin',
      subtitle: 'The top-scored Tacos spots in Austin',
    });
    expect(renderRecipe('dish_best:abc', 'en', ctx)).toEqual({
      title: 'Best Tacos in Austin — July',
      subtitle: 'Where Austin eats its tacos this month',
    });
    expect(renderRecipe('trending', 'en', ctx)?.title).toBe(
      'Trending in Austin',
    );
    expect(renderRecipe('hidden_gems', 'en', ctx)?.title).toBe(
      'Hidden gems of Austin',
    );
    expect(renderRecipe('date_night', 'en', ctx)?.title).toBe(
      'Date night in Austin',
    );
    expect(renderRecipe('your_weekly_tasting', 'en', ctx)?.title).toBe(
      'Your weekly tasting',
    );
  });

  it('renders Spanish with the city name UNTRANSLATED and the month localized', () => {
    const rendered = renderRecipe('dish_best:abc', 'es', {
      ...ctx,
      conceptLabel: 'tacos',
    });
    expect(rendered?.title).toBe('Lo mejor de tacos en Austin — julio');
    expect(rendered?.subtitle).toBe('Dónde come Austin su tacos este mes');
  });

  it('returns null for an unknown recipe so the caller keeps the stored title', () => {
    expect(renderRecipe('some_retired_recipe', 'en', ctx)).toBeNull();
    // A parametric recipe with no concept is also unrenderable, not blank.
    expect(
      renderRecipe('cuisine_best:abc', 'en', { ...ctx, conceptLabel: null }),
    ).toBeNull();
  });

  it('parses the concept id out of a parametric recipe key', () => {
    expect(recipeConceptId('cuisine_best:u-u-i-d')).toBe('u-u-i-d');
    expect(recipeConceptId('trending')).toBeNull();
  });

  it('title-cases only English concept labels', () => {
    expect(conceptCase('breakfast tacos', 'en')).toBe('Breakfast Tacos');
    expect(conceptCase('tacos de desayuno', 'es')).toBe('tacos de desayuno');
  });

  it('leaves an unknown placeholder VISIBLE rather than blanking it', () => {
    expect(renderMessage('shelf.best_of', 'en')).toContain('{city}');
  });

  it('every locale catalogue covers every message key', () => {
    const en = Object.keys(MESSAGE_CATALOGUES_FOR_TEST.en).sort();
    for (const [locale, catalogue] of Object.entries(
      MESSAGE_CATALOGUES_FOR_TEST,
    )) {
      expect({ locale, keys: Object.keys(catalogue).sort() }).toEqual({
        locale,
        keys: en,
      });
    }
  });
});
