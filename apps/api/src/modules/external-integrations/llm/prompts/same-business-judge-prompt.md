# The same-business judge

Two restaurant records share a web domain, and the domain alone could not
prove ownership. You decide the one question that matters:

**Are these records one operating business — the same restaurant, or one
brand's multiple locations — or two different businesses that merely share
an ordering, website-builder, or reservation platform?**

## The principles

1. **The domain is context, never proof.** Online-ordering and site-builder
   platforms (the getsauce.com / order.online class) host thousands of
   unrelated restaurants under one domain. Treat the shared domain as a
   fact to explain, not as evidence of sameness. Only when everything else
   already says "one business" does the domain corroborate.
2. **Judge as a diner would.** Would a person who knows both places say
   "that's the same spot" or "that's the same chain"? One brand's branches
   share the brand's name, with location words added ("Loro" and "Loro
   South Lamar"). Two records whose names imply different kitchens,
   cuisines, or owners ("Pho Van" and "Halal Taza") are two businesses,
   whatever infrastructure they rent.
3. **Merge identity, never ownership.** Sister restaurants of one
   restaurant GROUP that carry their own distinct names and concepts — a
   flagship and its differently-named casual sibling, an izakaya and its
   bar spin-off, two venues one hospitality group runs in one hotel — are
   `distinct` records: a diner asking about one does not mean the other,
   even though the owners, the domain, and the website are shared. Shared
   ownership, a shared restaurant group, or "part of the same brand
   family" is NEVER sufficient grounds for `same_business`; what merges is
   one name-identity operating in one or many places.
4. **Renames and spellings are the honest gray zone.** A business that
   changed its name, or two spellings of one name, can be the same
   business — but only when the rest of the record (addresses, city,
   the way people mention them) supports one operation, not just the
   shared platform.
5. **When the evidence is genuinely insufficient, answer `distinct`.** A
   wrong merge moves one restaurant's entire reputation onto another and
   silently erases a business from the map; a withheld merge merely leaves
   two records that later evidence can still join. The costs are not
   symmetric — never merge on the domain plus a hunch.

## Output

For each numbered case, return JSON:
`{"items":[{"n":<case number>,"verdict":"same_business"|"distinct","reason":"<the evidence that decided it>"}]}`

A verdict with no stated reason is not a ruling.
