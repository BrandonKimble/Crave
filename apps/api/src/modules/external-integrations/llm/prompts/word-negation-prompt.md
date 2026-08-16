# Does this word negate what follows?

You are certifying the VOCABULARY of a food-discovery app's search index. Each
numbered case gives you ONE word and ONE language. Answer one question about
it:

**Does this word, in this language, negate what follows it?**

WHY IT IS ASKED. A person typing "ramen without pork" or "phở không thịt" is
naming one thing they want and one thing they do not. The app reads the ask
literally — it grounds every word positively — but the semantic model that
reads leftover phrasing must not be handed a bare negator, or it embeds the
negator as if it were the dish. So the only thing this answer does is decide
whether a word is dropped before that model reads the phrase. Nothing about
matching a NAME depends on it: a negator inside a restaurant's name is a real
word of that name and is never touched.

WHAT DECIDES IT:

- YES means: placed before a word or phrase, this word's ordinary job is to
  deny, exclude, forbid, or subtract THAT OTHER WORD. "No pork", "without
  cheese", "sin cerdo" — the searcher typed the negator, and then typed the
  thing it denies, as a SEPARATE word.
- NO means everything else, including words that merely express smallness,
  lateness, doubt, contrast, or a question. A word that says "not yet", "a
  little", "rarely", or "but" is not negating what follows it — it is
  qualifying it, and dropping it would delete meaning the searcher supplied.
- THE ABSENCE MUST BE OF SOMETHING ELSE, NOT OF SOMETHING SEALED INSIDE THE
  WORD. This rule decides most hard cases, and getting it wrong destroys real
  searches. `boneless`, `cheeseless`, `meatless`, `flourless`, `unsweetened`,
  `nonalcoholic`, `deshuesado` all MEAN an absence — and every one of them is
  a NAME for a kind of food a person orders and a menu prints. What they deny
  is already inside them, so there is nothing following for them to deny.
  Answer NO. Answering yes deletes `boneless` from "boneless wings" and the
  searcher is shown wings with bones.
- A WORD THAT NAMES SOMETHING ORDERABLE IS NOT A NEGATOR, whatever its meaning
  suggests. `zero` is a soft drink; `free` is half of "gluten free" and an
  ordinary adjective besides; `off`, `hold` and `86` are kitchen slang a menu
  also uses positively. Answer NO. The negators this question is for are the
  small closed set of FUNCTION WORDS a language uses to deny the next word,
  and nothing else.
- JUDGE THE WORD AS SPELLED, IN THE LANGUAGE GIVEN. The spelling you are given
  is exact, diacritics included, and diacritics change words: two spellings
  differing only by an accent are DIFFERENT words with different answers. Never
  repair, transliterate, or strip a spelling into a word you find more
  familiar.
- A SPELLING THAT IS NOT A WORD OF THE STATED LANGUAGE NEGATES NOTHING THERE.
  Answer no. Negation is something a word does IN a language.
- THE LANGUAGE IS PART OF THE QUESTION. Answer only for the language stated.
- THE COSTS ARE NOT EQUAL. A false NO costs one word of context: the model
  reads an exclusion as a request, which this app's literal doctrine already
  tolerates. A false YES DELETES A WORD THE SEARCHER TYPED, and if that word
  was the dish, the search is gone. When genuinely torn, answer NO.
- ANSWER FOR THE WORD ALONE. A negation that only exists as part of a longer
  fixed phrase does not make the single word a negator.

THE LANGUAGE TAG `und` means nobody could determine the language of this word.
Answer yes only if the exact spelling is a recognisable negator in some
language and is not, in any language, an ordinary name for something edible or
drinkable — an ambiguous spelling belongs to the food sense, because deleting a
dish costs more than embedding an extra word.

GOLD CASES — these exact answers are the calibration of the rule:

| word       | language | answer | why                                            |
| ---------- | -------- | ------ | ---------------------------------------------- |
| `không`    | vi       | yes    | the plain Vietnamese negator                   |
| `chưa`     | vi       | yes    | "not yet" — denies that the thing has happened |
| `chua`     | vi       | no     | sour; a flavour, no negation in the spelling   |
| `sin`      | es       | yes    | "without"                                      |
| `no`       | en       | yes    | the plain English negator                      |
| `senza`    | it       | yes    | "without"                                      |
| `不`       | zh       | yes    | the plain Mandarin negator                     |
| `的`       | zh       | no     | the attributive particle; negates nothing      |
| `boneless` | en       | no     | names a kind of wing; the bone is inside it    |
| `free`     | en       | no     | ordinary adjective, and half of "gluten free"  |
| `zero`     | und      | no     | names a soft drink; denies no following word   |

Return ONLY JSON matching the enforced output schema: for each case,
`negates` (true or false) and `reason` — one short sentence naming the ACTUAL
ground, in the terms above. The reason is read by people auditing verdicts; a
blank reason leaves the word unjudged.
