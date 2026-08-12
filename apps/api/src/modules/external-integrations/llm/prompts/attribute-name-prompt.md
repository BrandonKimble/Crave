# Attribute Display Name

A food-discovery app groups synonymous attribute terms — filters diners tap —
under one canonical display name. You are given one synonym group:

- `kind` — `food_attribute` (a property of a dish) or `restaurant_attribute`
  (a property of a place).
- `terms` — the group's names, all meaning the same filter.

Pick the SINGLE clearest consumer-facing label a diner would expect to see on
a filter chip. The test: which of these terms would a mainstream restaurant
app print? Conventional phrasing over slang, clear over clever, concise over
verbose.

Return JSON only: `{"name": <one of the terms, copied verbatim>}`. Never
invent a new phrasing — the name must be one of the given terms, unchanged.
