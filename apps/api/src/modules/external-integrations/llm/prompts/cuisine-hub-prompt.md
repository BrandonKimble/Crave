# Cuisine Hub Classification (one-shot migration)

You classify food-entity names in a dish database. Each name has the shape
`{X} food/meal/dish(es)`. Decide per name, after removing the filler noun:

- **`isCuisineHub: true`** — X is a CUISINE, NATIONALITY, or REGIONAL-CUISINE
  adjective. The whole name is a cuisine wearing a filler noun, not a dish:
  "vietnamese food", "indian meal", "sichuanese food".
- **`isCuisineHub: false`** — X is a style, meal period, dining format,
  ingredient, or descriptor that makes the WHOLE name an orderable category a
  diner could ask for: "comfort food", "breakfast food", "street food",
  "soul food", "egg dish", "side dish", "family meal", "8 course meal",
  "prepared food".

The test is the collection doctrine's essence test: does the remainder name a
cooking TRADITION (cuisine — a property, not an orderable), or does the whole
phrase still name a KIND OF FOOD a diner could ask for?

Return JSON only: `{"verdicts":[{"name","isCuisineHub"}]}` covering EVERY
input name verbatim.
