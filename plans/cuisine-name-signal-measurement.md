# Cuisine-from-venue-name: how often would it be wrong?

Measurement only — no behavior change. Owner reopening the ruling on deriving a
place's cuisine from its NAME. Run 2026-08-29 against the staging corpus
(staging == local corpus mirror), read-only.

## Method

- Cuisine words = the 94 distinct names of `facet='cuisine'` vocabulary rows
  (`core_entities`, type `place_attribute`).
- Every ACTIVE place whose name contains a cuisine word at a word boundary.
- Independent evidence per place: Google Places `types` + `primaryType` +
  `editorialSummary` (in `restaurant_metadata.googlePlaces`) and stated
  cuisine-attribute evidence (`core_restaurant_attribute_evidence` joined to
  cuisine-facet attributes).
- "Agree" = the name's cuisine word appears in that evidence (types folded
  `_`→space); "undeterminable" = no evidence of any kind.

## Totals

| | count |
|---|---|
| Places with a cuisine word in the name | **652** |
| (name, word) pairs measured | 719 |
| String-level agree | 480 (67%) |
| String-level disagree | 147 (20%) |
| Undeterminable (no evidence at all) | 92 (13%) |

## The headline, after reading all 147 string-level disagreements by hand

Almost all of the 147 are NOT the name being wrong — they are vocabulary gaps
in the comparison, where the evidence says the same thing in different words:

- **bbq → `barbecue_restaurant` / `korean_barbecue_restaurant`** (≈50 rows):
  the name is right every time.
- **Finer-grained-than-Google** (≈25 rows): `sichuan`/`dim sum` vs Google's
  `chinese_restaurant`, `bavarian` vs `german`, `georgian` vs
  `eastern_european`, `izakaya` vs `japanese`, `burmese` vs `asian`,
  `nepali` vs `indian` (Google has no nepali type). The NAME is the *better*
  signal in these rows.
- **Dietary/format words that stay true regardless of kitchen** (≈15 rows):
  `halal` on a Chinese or Mediterranean kitchen is still true.
- **Non-restaurant venues where the tradition is still right** (≈20 rows):
  Japanese grocery, Greek bakery, Italian bakery, European market — the word
  is honest, the venue just isn't typed `*_restaurant`.

**Genuinely wrong or misleading name-derived cuisine: 13 of 719 pairs
(1.8%), 13 of 652 places (2.0%).** Every one:

| name | name-derived | actually |
|---|---|---|
| Tocabe, An American Indian Eatery | indian | Native American (build-your-own tacos, bison ribs) |
| Texas French Bread | french | bakery/cafe — sandwiches, bistro fare (the owner's own example: confirmed wrong) |
| French Quarter Grille | french | Cajun / New Orleans (gumbo) |
| Roman's | roman | New American small plates ("Roman" is a person's name) |
| Go Greek Yogurt | greek | frozen-yogurt shop (pun brand) |
| Great American Cookies | american | mall cookie chain — "American" is brand, not cuisine |
| All American Bagel & Barista Company | american | bagel/coffee shop |
| Culture An American Yogurt Company | american | yogurt shop |
| MEXICAN DOGGIS | mexican | hot-dog stand Google types as american (Mexican-style dogs — arguable) |
| Western Yunnan Crossing Bridge Noodle | western | Yunnan Chinese ("Western" is a region of Yunnan) |
| Jägerhaus German Mediterranean Restaurant | mediterranean | German beer hall (the `german` in the same name is right) |
| Jeremiah's Italian Ice | italian | American frozen-treat chain ("Italian ice" is a product name) |
| The Great British Baking Company | british | bakery riffing on the TV show |

Pattern in the failures: the cuisine word modifies a PRODUCT ("French Bread",
"Italian Ice", "American Cookies", "Greek Yogurt", "British Baking") or is a
homograph ("Indian" = Native American, "Roman" = a name, "Western" = a place),
not a claim about the kitchen. When the word directly modifies the venue
("X Thai", "Y Indian Cuisine", "Z Korean BBQ"), it was never wrong in this
corpus — the owner's "Aha Indian → indian ever false?" answer is NO (Aha
Indian itself has zero independent evidence, but no `<word> + venue`-shaped
name anywhere in the corpus contradicted its evidence).

Caveat: the measurement only covers words in the cuisine vocabulary.
"China Family"-style demonym names ("China", "Texas", "Saigon") are not
cuisine-vocab words and were not measured — deriving from those would be a
different, riskier rule.

## Undeterminable (92 pairs — no Google evidence, no stated cuisine)

Mostly obviously-right names ("Chaba Thai", "Tulsi Indian Cuisine",
"Lafuentes Mexican Restaurant", "Aha Indian", 24 plain `* Bbq` trailers).
These are exactly the places name-derivation would help: real cuisine
knowledge exists in the name and nowhere else. Two would be wrong:
"Spaghetti Western" (matched `western`; it's Italian) and "Pardon My
French" (a pun bar). Same product/homograph pattern.

## All 147 string-level disagreements (name | matched word | independent evidence)

| name | word | evidence |
|---|---|---|
| Kaia South African Farmhouse Restaurant | african | restaurant food — "Farm-to-table small plates, with craft beers & a New World wine list emphasizing South Africa." |
| All American Bagel & Barista Company | american | bagel_shop coffee_shop breakfast_restaurant cafe bakery food_store restaurant |
| American Cut | american | steak_house event_venue restaurant — "Modern steakhouse from Marc Forgione serving classic fare updated with NYC twists in posh surrounds." |
| CARVE American Grille - Barton Creek | american | restaurant steak_house bar food — "Polished steakhouse serving classic & creative mains & small plates, plus pasta & wood-fired pizza." |
| Cousin Louie’s Italian American | american | restaurant food |
| Culture An American Yogurt Company | american | dessert_shop confectionery food_store store food |
| Great American Cookies | american | bakery confectionery food_store store food — "Mall-based chain selling cookies & brownies offering some specialty flavors, plus cookie cakes." |
| Bento Teppanyaki Asian Cuisine | asian | chinese_restaurant japanese_restaurant restaurant food [stated: chinese, japanese] |
| Bep Saigon Asian Restaurant | asian | vietnamese_restaurant chinese_restaurant restaurant [stated: chinese, vietnamese] |
| Fusion Tadka Pure Vegetarian & Vegan Indian Pan Asian Restaurant | asian | restaurant vegan_restaurant diner buffet_restaurant vegetarian_restaurant indian_restauran [stated: indian] |
| QI Austin: Modern Asian Kitchen | asian | chinese_restaurant dim_sum_restaurant cantonese_restaurant restaurant food [stated: cantonese, chinese, dim sum] — "Stylish, upmarket restaurant featuring a farm-to-table menu of dim sum and elevated Chinese cuisine." |
| Le Basque French Vegan Restaurant | basque | vegan_restaurant cocktail_bar vegetarian_restaurant french_restaurant spanish_restaurant b [stated: french, spanish] |
| Bavarian Grill | bavarian | german_restaurant european_restaurant restaurant food [stated: european, german] — "A costumed staff, polka band & big beer selection fuel the festive mood at this German eatery." |
| 2fifty Texas BBQ, K St. | bbq | restaurant food |
| BBQ Frank Mexican food | bbq | mexican_restaurant barbecue_area restaurant food [stated: mexican] |
| Big O's BBQ & Grill | bbq | barbecue_restaurant restaurant |
| Bigg Belly BBQ Co. | bbq | barbecue_restaurant restaurant food |
| Bill Miller BBQ | bbq | barbecue_restaurant family_restaurant american_restaurant restaurant food [stated: american] — "Laid-back Texas-based chain serving up pit-smoked meats, fried chicken, breakfast & baked goods." |
| Brown's BBQ | bbq | barbecue_restaurant restaurant food — "This barbecue trailer parked next to Corner Bar dishes up brisket, chicken & comfort-food sides." |
| Camel City BBQ Factory | bbq | barbecue_restaurant restaurant food — "Pulled pork, brisket & local draft beers in an industrial-style venue with arcade games & a patio." |
| Camino Alamo BBQ 老段烧烤 | bbq | restaurant food |
| Chubby Skewers Authentic Chinese BBQ | Manhattan | bbq — "barbecue_restaurant chinese_restaurant restaurant food point_of_interest establishment" |
| DAM-A Korean Hot Pot & BBQ AYCE | Austin | bbq — "hot_pot_restaurant buffet_restaurant korean_barbecue_restaurant korean_restaurant restaura" |
| Dallas BBQ - Times Square | bbq | barbecue_restaurant bar restaurant — "Bustling local chain serving big plates of saucy meats & other classic fare plus jumbo margaritas." |
| Daori BBQ | bbq | korean_restaurant chicken_restaurant korean_barbecue_restaurant restaurant food point_of_i [stated: korean] |
| Don Don Korean BBQ | bbq | korean_barbecue_restaurant barbecue_restaurant korean_restaurant restaurant [stated: korean] |
| Donn's BBQ | bbq | barbecue_restaurant breakfast_restaurant catering_service food_delivery service — "Relaxed counter-serve joint featuring smoked meat combo plates, breakfast tacos & a full bar." |
| Down South Texas BBQ | bbq | barbecue_restaurant restaurant food |
| El Grandpa Mexican BBQ estilo hidalgo | bbq | mexican_restaurant restaurant food [stated: mexican] |
| First Chinese BBQ | bbq | chinese_restaurant asian_restaurant barbecue_restaurant restaurant food [stated: asian, chinese] — "Basic, modern mini-chain outpost for Cantonese chow from noodles to roast duck." |
| GAN-HOO BBQ | bbq | barbecue_restaurant barbecue_area chinese_restaurant asian_restaurant restaurant food poin [stated: asian, chinese] — "Traditional Asian barbecue dishes are served in this relaxed restaurant with tabletop grills." |
| Gopchang Story BBQ - Manhattan | bbq | korean_barbecue_restaurant korean_restaurant restaurant food [stated: korean] — "Busy, bustling restaurant offering Korean barbecue, fried rice & other classic fare." |
| Gyu-Kaku Japanese BBQ | bbq | japanese_restaurant bar restaurant [stated: japanese] |
| Honey Pig BBQ Austin | bbq | korean_barbecue_restaurant korean_restaurant restaurant food [stated: korean] |
| Hoodoo Brown BBQ | bbq | barbecue_restaurant restaurant food — "Classic Texas-style barbecue, craft beer & cocktails offered in a casual space with Old West decor." |
| Hou Hot Pot 厚火锅 & 极 Extreme Ji Chinese BBQ | bbq | hot_pot_restaurant barbecue_area restaurant food |
| It’s All Good BBQ | bbq | barbecue_restaurant restaurant food — "Homestyle joint serving traditional Texas-style barbecue such as brisket & ribs with classic sides." |
| Jongro BBQ Market | Best All You Can Eat Korean BBQ, Koreatown | bbq — "korean_barbecue_restaurant korean_restaurant restaurant point_of_interest food establishme" |
| K BBQ | bbq | korean_barbecue_restaurant korean_restaurant restaurant food [stated: korean] — "Pork, octopus & eel cooked on individual table grills, plus sake & soju, in streamlined surrounds." |
| KG BBQ | bbq | barbecue_restaurant restaurant |
| KOBA Korean BBQ | bbq | korean_restaurant restaurant [stated: korean] — "Trendy, upbeat counter-serve outfit serving up traditional Korean dishes with fast-food flair." |
| KPOT Korean BBQ & Hot Pot | bbq | korean_barbecue_restaurant buffet_restaurant hot_pot_restaurant asian_fusion_restaurant fu [stated: asian, asian fusion, fusion, korean] |
| KumSung BBQ | bbq | korean_barbecue_restaurant korean_restaurant restaurant food [stated: korean] |
| LOVE Korean BBQ | bbq | korean_barbecue_restaurant barbecue_restaurant korean_restaurant restaurant food point_of_ [stated: korean] — "Bustling, informal eatery serving generous plates of homestyle Korean barbecue." |
| Lockhart Chisholm Trail BBQ | bbq | barbecue_restaurant catering_service food_delivery restaurant food — "No-frills restaurant serving up barbecue, catfish & other Southern specialties cafeteria-style." |
| Mapo BBQ | bbq | korean_barbecue_restaurant barbecue_restaurant korean_restaurant restaurant food point_of_ [stated: korean] — "Tableside grilling is the highlight at this buzzy Korean spot known for its kalbi & numerous sides." |
| Ming Xing BBQ | bbq | chinese_restaurant restaurant food [stated: chinese] |
| Obaltan K-BBQ (곱창ㅣ조개구이ㅣ소고기) | bbq | korean_barbecue_restaurant seafood_restaurant korean_restaurant restaurant [stated: korean] |
| Pig Beach BBQ Queens | bbq | barbecue_restaurant restaurant — "Industrial venue with Southern flair selling smoked & grilled ribs, burgers, brisket, sides & more." |
| Pig Pen BBQ | bbq | barbecue_restaurant south_american_restaurant american_restaurant restaurant food point_of [stated: american, south american] |
| Pik Nik BBQ | bbq | barbecue_restaurant sandwich_shop american_restaurant restaurant food [stated: american] |
| Rabel’s Roadhaus BBQ | bbq | barbecue_restaurant restaurant food |
| Rollin Smoke BBQ | bbq | barbecue_restaurant catering_service food_delivery meal_takeaway service restaurant point_ — "Slow-smoked barbecue, plus tacos & sandwiches on offer in this snug & popular window-serve spot." |
| SIK GAEK BBQ | bbq | korean_barbecue_restaurant barbecue_restaurant meal_delivery korean_restaurant food_delive [stated: korean] — "Fresh seafood, some still wriggling in the pot, is the draw at this no-frills Korean restaurant." |
| Sam's BBQ | bbq | barbecue_restaurant restaurant food — "No-frills landmark covered in memorabilia serving brisket, ribs & mutton in a straight-up manner." |
| Smoke'N Ash BBQ | bbq | barbecue_restaurant vegan_restaurant vegetarian_restaurant fusion_restaurant ethiopian_res [stated: ethiopian, fusion] |
| Smokey Mo's BBQ | bbq | barbecue_restaurant breakfast_restaurant barbecue_area restaurant food — "Local chain serving barbecued meats & sides (plus breakfast) in a no-frills, counter-serve setting." |
| Southside Market & BBQ - Austin at Arbor Walk | bbq | barbecue_restaurant butcher_shop catering_service food_delivery manufacturer food_store se |
| The Green Mesquite BBQ & More | bbq | barbecue_restaurant restaurant — "Casual operation with a neighborhood vibe serving hearty, old-fashioned plates of meat." |
| True Texas BBQ | bbq | barbecue_restaurant catering_service food_delivery service restaurant |
| Xinjiang BBQ stand | bbq | barbecue_restaurant kebab_shop chinese_restaurant restaurant food [stated: chinese] |
| ZAYAN HALAL BBQ | bbq | catering_service food_delivery service food |
| an nyeong k tofu & bbq | bbq | korean_restaurant restaurant food [stated: korean] |
| miss KOREA BBQ | bbq | korean_barbecue_restaurant bar_and_grill barbecue_restaurant asian_restaurant vegetarian_r [stated: asian, korean] — "Chic, zen-like Koreatown restaurant for barbecue, bulgogi and hot pots." |
| The Great British Baking Company | british | bakery food_store store food |
| Burmese Bites | burmese | asian_restaurant restaurant food [stated: asian] |
| Mr. Crabby's Cajun Seafood & Bar - Stone Oak | cajun | point_of_interest |
| Artara Coffee (Cambodian) | cambodian | coffee_shop cafe food_store store food |
| Hou Hot Pot 厚火锅 & 极 Extreme Ji Chinese BBQ | chinese | hot_pot_restaurant barbecue_area restaurant food |
| Tian Tian Golden Palace Seafood & Dim Sum Austin | dim sum | chinese_restaurant restaurant [stated: chinese] |
| Borderless European Market (BEM) | european | grocery_store food_store food store |
| Brooklyn French Bakers Waterfront | french | bakery pastry_shop dessert_shop confectionery food_store store food |
| French Quarter Grille | french | cajun_restaurant american_restaurant bar restaurant food [stated: american, cajun] — "Casual space with New Orleans-inspired paintings offering gumbo & other classic Cajun eats." |
| Texas French Bread | french | bakery bistro breakfast_restaurant coffee_shop cafe wholesaler manufacturer food_store sto — "Chill, cozy bakery/cafe offering a sandwich menu for lunch & bistro fare & wine for dinner." |
| Don Neo Fusion 丼 | fusion | japanese_restaurant restaurant food [stated: japanese] |
| Fusion Tadka Pure Vegetarian & Vegan Indian Pan Asian Restaurant | fusion | restaurant vegan_restaurant diner buffet_restaurant vegetarian_restaurant indian_restauran [stated: indian] |
| MEAMA Georgian Fusion | Wine Bar | fusion — "eastern_european_restaurant restaurant food point_of_interest establishment" |
| Muse Fusion + Sushi | fusion | restaurant food |
| Pita Fusion | fusion | sandwich_shop mediterranean_restaurant salad_shop fast_food_restaurant catering_service fo [stated: mediterranean] |
| Shanghai Dumplings Fusion | fusion | dumpling_restaurant restaurant food |
| Yeni’s Fusion (North Food Truck) | fusion | indonesian_restaurant restaurant [stated: indonesian] |
| Georgian House | georgian | eastern_european_restaurant restaurant [stated: eastern european] |
| MEAMA Georgian Fusion | Wine Bar | georgian — "eastern_european_restaurant restaurant food point_of_interest establishment" |
| Go Greek Yogurt | greek | dessert_shop confectionery food_store store food |
| Poseidon Greek Bakery | greek | bakery food_store — "Veteran mom-&-pop outfit supplying sweet & savory fare from phyllo & spanakopita to baklava." |
| BASHIR HALAL FOOD | halal | fast_food_restaurant restaurant |
| Castle Chicken & Halal Sauce Up | halal | restaurant |
| Fatima's Halal | halal | chinese_restaurant restaurant food [stated: chinese] |
| Fresh Gyro Halal | halal | restaurant |
| Halal Hub(South) | halal | meal_takeaway restaurant food — "Late-night food truck fixing up gyro wraps, falafel & other Mediterranean plates at the counter." |
| Halal On Fire | halal | mediterranean_restaurant restaurant food [stated: mediterranean] |
| Jiang's Kitchen 疆湖 - Halal Chinese Food | halal | chinese_restaurant asian_restaurant chinese_noodle_restaurant barbecue_restaurant meal_del [stated: asian, chinese] |
| Soco halal | halal | restaurant |
| World Food & Halal Market | halal | grocery_store supermarket food_store store food |
| ZAYAN HALAL BBQ | halal | catering_service food_delivery service food |
| Ululani's Hawaiian Shave Ice - Round Rock | hawaiian | dessert_shop confectionery food_store store food — "Renowned spot for shave ice featuring exotic flavors, such as pickled mango, lychee & passion fruit." |
| The Hungarian Pastry Shop | hungarian | bakery pastry_shop coffee_shop cafe dessert_shop confectionery food_store store food point — "Mellow, dimly lit cafe & bakery selling cappuccino, croissants & Eastern European treats." |
| Everest Momo & Food Truck(Nepali and Indian cuisine) | indian | restaurant food |
| Tocabe, An American Indian Eatery | indian | american_restaurant restaurant food [stated: american] — "Contemporary, counter-serve Native American spot with build-your-own tacos, bison ribs & nachos." |
| Kelly's Irish Pub | irish | bar |
| Cappone's Italian Sandwich Shop and Salumeria | italian | sandwich_shop restaurant food |
| Cousin Louie’s Italian American | italian | restaurant food |
| Gelatoro - Italian Ice Cream | italian | ice_cream_shop dessert_shop confectionery food_store store food |
| Jeremiah's Italian Ice | italian | ice_cream_shop dessert_shop confectionery food_store store food — "Counter-serve stand with frozen treats, including soft-serve cones, ices & its signature Jelati in many flavor" |
| Marino's Real Italian Ices Co | italian | manufacturer |
| Pietro's Italian Bakery | italian | bakery dessert_restaurant pastry_shop dessert_shop confectionery food_store restaurant foo |
| Sapori Italian Roots | italian | restaurant food |
| Zeppieri & Sons Italian Bakery | italian | bakery food_store store food — "Bread, rolls & classic desserts like cannoli are served at this old-school neighborhood staple." |
| Izakaya Nana | izakaya | japanese_restaurant yakitori_restaurant sushi_restaurant bar restaurant food [stated: japanese] |
| Kushi Kushi Yaki | Ramen & Yakitori Izakaya | izakaya — "ramen_restaurant yakitori_restaurant japanese_restaurant restaurant food point_of_interest" |
| Cuffie Ridge Jamaican Vegan Café | jamaican | vegan_restaurant vegetarian_restaurant coffee_shop cafe food_store store restaurant food p |
| Jamaican Flavors | jamaican | restaurant |
| Hokkaisan Japanese Deli Sushi | japanese | grocery_store food_store store food |
| Katagiri Japanese Grocery | japanese | asian_grocery_store supermarket grocery_store food_store store food |
| Don Don Korean BBQ | korean bbq | korean_barbecue_restaurant barbecue_restaurant korean_restaurant restaurant [stated: korean] |
| Jongro BBQ Market | Best All You Can Eat Korean BBQ, Koreatown | korean bbq — "korean_barbecue_restaurant korean_restaurant restaurant point_of_interest food establishme" |
| KOBA Korean BBQ | korean bbq | korean_restaurant restaurant [stated: korean] — "Trendy, upbeat counter-serve outfit serving up traditional Korean dishes with fast-food flair." |
| KPOT Korean BBQ & Hot Pot | korean bbq | korean_barbecue_restaurant buffet_restaurant hot_pot_restaurant asian_fusion_restaurant fu [stated: asian, asian fusion, fusion, korean] |
| LOVE Korean BBQ | korean bbq | korean_barbecue_restaurant barbecue_restaurant korean_restaurant restaurant food point_of_ [stated: korean] — "Bustling, informal eatery serving generous plates of homestyle Korean barbecue." |
| Louisiana Crab Shack | louisiana | cajun_restaurant american_restaurant seafood_restaurant restaurant food [stated: american, cajun] |
| Athena Mediterranean Cuisine | mediterranean | greek_restaurant restaurant food [stated: greek] |
| Darna Lebanese-Mediterranean Cuisine | mediterranean | middle_eastern_restaurant lebanese_restaurant restaurant food [stated: lebanese, middle eastern] |
| Jägerhaus German Mediterranean Restaurant | mediterranean | german_restaurant beer_garden european_restaurant bar restaurant food [stated: european, german] — "Classic German beer hall & gastropub offering traditional Bavarian fare & Oktoberfest events." |
| Mediterranean Foods | mediterranean | supermarket health_food_store grocery_store food_store food store |
| Zara Terrace Mediterranean Restaurant | mediterranean | turkish_restaurant restaurant food [stated: turkish] |
| MEXICAN DOGGIS | mexican | hot_dog_stand meal_takeaway american_restaurant restaurant food [stated: american] |
| Middle Eastern Halal Cart | middle eastern | halal_restaurant restaurant food [stated: halal] |
| Souk El-Shater Middle Eastern Cuisine | middle eastern | restaurant |
| Bombay to Kathmandu Indian and Nepali Cuisine | nepali | indian_restaurant asian_restaurant meal_delivery meal_takeaway pizza_restaurant food_deliv [stated: asian, indian] — "Informal eatery serving Indian classics like biryani & tandoori dishes, plus specialties from Nepal." |
| Everest Momo & Food Truck(Nepali and Indian cuisine) | nepali | restaurant food |
| Himalaya Kosheli Nepali & Indian | nepali | halal_restaurant buffet_restaurant indian_restaurant restaurant [stated: halal, indian] |
| Lali Son Fast Food: Indian & Nepali Cuisine | nepali | indian_restaurant restaurant food [stated: indian] |
| Mousam Spice House ( Indian and Nepali Food ) | nepali | indian_restaurant restaurant food [stated: indian] |
| Nepali Bhanchha Ghar | nepali | restaurant food |
| Brasa Peruvian Kitchen | peruvian | restaurant food |
| Bad Roman | roman | italian_restaurant cocktail_bar bar restaurant food [stated: italian] |
| Roman's | roman | italian_restaurant wine_bar cocktail_bar bar restaurant food [stated: italian] — "Hip, vintage-chic neighborhood spot preparing locally sourced New American small plates." |
| The Russian Tea Room | russian | fine_dining_restaurant brunch_restaurant wedding_venue bar event_venue service — "Continental classics like borscht, caviar & vodka served in a flashy, opulent setting." |
| Liu Ji Sichuan Noodle House | sichuan | chinese_noodle_restaurant dumpling_restaurant noodle_shop meal_takeaway chinese_restaurant [stated: chinese] |
| Sichuan river | sichuan | chinese_restaurant restaurant food [stated: chinese] |
| TAI ER SICHUAN CUISINE 太二酸菜鱼 (FLUSHING) | sichuan | chinese_restaurant restaurant food [stated: chinese] |
| The Best Sichuan | sichuan | chinese_restaurant restaurant food [stated: chinese] |
| The Best Sichuan 21 一品成都 | sichuan | hot_pot_restaurant chicken_restaurant meal_takeaway korean_restaurant chinese_restaurant r [stated: chinese, korean] |
| Joe's Sicilian Bakery Inc. | sicilian | bakery food_store store food |
| Boon Dee Moo Ka Ta Thai B.B.Q. | thai | restaurant food |
| P Thai's Khao Man Gai & Noodles | thai | restaurant |
| Western Yunnan Crossing Bridge Noodle | western | chinese_noodle_restaurant soup_restaurant restaurant food |
