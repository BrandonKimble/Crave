# Does this word carry a concept, or only grammar?

You are certifying the VOCABULARY of a food-discovery app's search index. Each
numbered case gives you ONE word and ONE language. Answer one question about
it:

**Does this word, in this language, carry a concept a person could seek —
something that could be ordered, cooked, or named — or does it only do
grammatical work between other words?**

THE LENS — a searcher, not a dictionary. Imagine the word arriving alone in a
food app's search box, typed by a speaker of the stated language. If a person
could mean SOMETHING by it — something that could be ordered, cooked, or named
— it carries a concept. If it can only sit BETWEEN other words, contributing
structure and no substance of its own, it does grammatical work.

THIS IS NOT A QUESTION ABOUT HOW SPECIFIC THE WORD IS. A very broad word still
names something: `food`, `restaurant`, `best` and `nearby` all carry concepts,
because a person means something by each of them. Whether an ask is too vague
to act on is a different question, decided elsewhere and not by you. You are
deciding one thing only: content, or glue.

WHAT DECIDES IT:

- CARRIES A CONCEPT means the word has content a person could be seeking or
  describing, however broad. Breadth is not the test. The test is whether the
  word, alone, points at anything at all.
- GRAMMATICAL WORK means the word's job is to relate, mark, connect, position,
  quantify-without-naming, or otherwise glue — and it names nothing on its own.
  A speaker asked "what is it?" about such a word has nothing to point to.
  Articles, prepositions, conjunctions, case and aspect markers, classifiers,
  pronouns and copulas are the shape of this answer.
- JUDGE THE WORD AS SPELLED, IN THE LANGUAGE GIVEN. The spelling you are given
  is exact, diacritics included, and diacritics change words: two spellings
  that differ only by an accent are DIFFERENT words with different answers. Do
  not silently repair, transliterate, or strip a spelling into a word you find
  more familiar.
- A SPELLING THAT IS NOT A WORD OF THE STATED LANGUAGE CARRIES A CONCEPT.
  Answer true and say so in your reason. This is the single most important
  rule here, and it is not a technicality: a borrowed dish name sits in a
  language's text constantly — `feteer` in Spanish, `pho` in English, `taco`
  in Vietnamese — and it is precisely the thing a person is searching for.
  Grammatical work is something a word does IN a language; a word that is not
  in that language does no grammatical work there, so it can never be glue.
  The failure this prevents is deleting a real dish from an ask because it was
  foreign to the tag it arrived under.
- THE LANGUAGE IS PART OF THE QUESTION. The same letters are a concept in one
  language and pure grammar in another; answer only for the language stated,
  never for the one the spelling reminds you of.
- WHEN A WORD IS BOTH — it does grammatical work in most sentences AND names
  something in its own right — it CARRIES A CONCEPT. Someone can still be
  seeking the thing it names, and treating it as pure grammar would delete
  their ask.
- A PROPER NOUN, A BRAND, OR A PLACE NAME carries a concept: it names
  something.
- A NUMERAL OR A UNIT carries a concept when a person could be seeking it and
  does grammatical work when it only counts other words.

THE LANGUAGE TAG `und` means nobody could determine the language of this word.
Answer for the word as a bare string that some human typed: it carries a
concept if there is any language in which that exact spelling names something
edible, drinkable, or dining-related; it is grammatical work only if the
spelling is recognisably a function word and nothing more.

GOLD CASES — these exact answers are the calibration of the rule:

| word     | language | answer          | why                                         |
| -------- | -------- | --------------- | ------------------------------------------- |
| `chua`   | vi       | carries concept | sour — a flavour a person seeks             |
| `chưa`   | vi       | grammar         | "not yet"; marks time, names nothing        |
| `it`     | en       | grammar         | a pronoun standing in for other words       |
| `ít`     | vi       | carries concept | "little / few" — a degree of a thing served |
| `de`     | es       | grammar         | "of"; relates two words                     |
| `al`     | es       | grammar         | "to the"; relates two words                 |
| `birria` | es       | carries concept | a stew — a dish that can be ordered         |
| `的`     | zh       | grammar         | the possessive/attributive particle         |

Return ONLY JSON matching the enforced output schema: for each case,
`carries_concept` (true or false) and `reason` — one short sentence naming the
ACTUAL ground, in the terms above. The reason is read by people auditing
verdicts; a blank reason leaves the word unjudged.
