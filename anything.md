{
  "testMetadata": {
    "testName": "ENHANCED CONCURRENT LLM PROCESSING TEST - Compound Terms + 16 Processors",
    "timestamp": "2025-08-14T04:44:05.055Z",
    "processingTime": 75224,
    "inputStats": {
      "posts": 1,
      "comments": 176
    },
    "outputStats": {
      "mentions": 143,
      "validationErrors": 0
    },
    "concurrentProcessingMetrics": {
      "chunksCreated": 44,
      "chunkSizes": [
        28,
        8,
        14,
        3,
        5,
        3,
        3,
        5,
        11,
        8,
        3,
        2,
        1,
        6,
        6,
        3,
        2,
        5,
        1,
        1,
        1,
        2,
        3,
        1,
        1,
        1,
        1,
        4,
        3,
        2,
        1,
        1,
        2,
        1,
        1,
        1,
        1,
        3,
        1,
        2,
        1,
        4,
        6,
        14
      ],
      "chunkingTime": 6,
      "concurrentProcessingTime": 75218,
      "chunksProcessed": 44,
      "successRate": 95.45454545454545,
      "averageChunkTime": 18.67009523809524,
      "fastestChunk": 6.522,
      "slowestChunk": 45.412,
      "topCommentsProcessed": 12,
      "concurrencyLimit": 16,
      "performanceImprovement": "~1x faster than old implementation (16 concurrent vs 8 concurrent)",
      "schemaEnhancements": "Added dish_categories array for compound term hierarchical decomposition"
    }
  },
  "input": {
    "posts": [
      {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "selftext": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "permalink": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_utc": 1728663903,
        "comments": [
          {
            "id": "t1_lrfp6ta",
            "body": "Not sure that's better than Perry's Friday pork chop lunch special.",
            "author": "Tweedle_DeeDum",
            "score": 260,
            "created_utc": 1728665003,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgauhf",
            "body": "Brother, we’re talking about pork and prime rib here. Are you serious?",
            "author": "wulfgyang",
            "score": 22,
            "created_utc": 1728672033,
            "parent_id": "t1_lrfp6ta",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgb9lo",
            "body": "It's a real big pork chop.",
            "author": "Odd_Bodkin",
            "score": 83,
            "created_utc": 1728672169,
            "parent_id": "t1_lrgauhf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrge5sz",
            "body": "I’ve had it, I’ll say it’s good. But that’s prime rib on his plate for the same price.",
            "author": "wulfgyang",
            "score": 18,
            "created_utc": 1728673125,
            "parent_id": "t1_lrgb9lo",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrggn7s",
            "body": "Well, the plate shown by OP is actually $35 but then the sides at Perry's are not cheap either.  \n\nThe Perry chop is 1.5lbs and includes mashed potatoes and apple sauce.  My experience is that you either split it with someone or have a second meal of leftovers.\n\nThey will split it for you when you order if you ask.",
            "author": "Tweedle_DeeDum",
            "score": 36,
            "created_utc": 1728673955,
            "parent_id": "t1_lrge5sz",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhlb83",
            "body": "Worst part about it is that it’s on Friday, and every I’d leave it in the fridge at work and forget it every damn time",
            "author": "skratsda",
            "score": 5,
            "created_utc": 1728688493,
            "parent_id": "t1_lrggn7s",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhujz5",
            "body": "You're not supposed to go back to work after Friday pork chop lunch at Perry's",
            "author": "quirino254",
            "score": 48,
            "created_utc": 1728692273,
            "parent_id": "t1_lrhlb83",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgogtu",
            "body": "Yes. I’m a ribeye steak guy and I’m not a pork chop guy. Except for Perry’s. I’ll take a Perry’s pork chop over almost any cut of beef",
            "author": "Zurrascaped",
            "score": 16,
            "created_utc": 1728676590,
            "parent_id": "t1_lrgjf4l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkwu2b",
            "body": "Exactly. Perry's pork chop is better than 90% of the steaks I've had in my life.",
            "author": "qaat",
            "score": 1,
            "created_utc": 1728748092,
            "parent_id": "t1_lrgogtu",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri23ke",
            "body": "The seasoning for prime rib comes from the au jus. It’s the tenderness of the meat plus the saltiness of the au jus that makes the whole experience. \n\nIt is not just my favorite preparation of beef, it is my favorite food period. I am not allured by the price. There is plenty of expensive food that I could care less about (filet mignon comes to mind).",
            "author": "regissss",
            "score": 3,
            "created_utc": 1728695409,
            "parent_id": "t1_lrgjf4l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri6oj7",
            "body": "Yep prime rib is overrated",
            "author": "XTingleInTheDingleX",
            "score": 2,
            "created_utc": 1728697383,
            "parent_id": "t1_lrgjf4l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh6ev9",
            "body": "Prime rib isn’t seasoned? That seems like a preparation issue, also there’s an au jus for a reason.",
            "author": "southpark",
            "score": 1,
            "created_utc": 1728682759,
            "parent_id": "t1_lrgjf4l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgj2dr",
            "body": "Have you had the pork chop being referenced? This isn’t like a Sam’s club special pork chop…",
            "author": "pbagwell84",
            "score": 15,
            "created_utc": 1728674772,
            "parent_id": "t1_lrge5sz",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrk2fx9",
            "body": "They smoked their pork chop for 4 to 6 hours. Then they see it with a brown sugar like rub.  The darker it is more tender it is. Like many have said it can be dry sometimes if it hasn’t been smoked for long enough, but it still an excellent deal. \nI know the domain location gets slammed where they have to serve over 1000 pork chops on Friday during lunch  so the consistency may not be as tender as dinner time.",
            "author": "AutofillUserID",
            "score": 2,
            "created_utc": 1728736623,
            "parent_id": "t1_lrgj2dr",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkfsw9",
            "body": "Interesting. I didn’t know how it was prepared, just that it is delicious. I love the three different sections, as they do feel like 3 completely different pieces of meat, all served on one plate. Naturally, my first time having it was the best and other times it hasn’t been quite as good, but always very tasty and the deal on Friday is just a bonus.",
            "author": "pbagwell84",
            "score": 1,
            "created_utc": 1728742112,
            "parent_id": "t1_lrk2fx9",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhldza",
            "body": "I don’t know if you’ve had it but it’s a REALLY good pork chop. Never had anything like it.",
            "author": "KendrickBlack502",
            "score": 6,
            "created_utc": 1728688524,
            "parent_id": "t1_lrgauhf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjzosz",
            "body": "Prime rib is garbage",
            "author": "Longhorn24",
            "score": 1,
            "created_utc": 1728735332,
            "parent_id": "t1_lrgauhf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkkbdj",
            "body": "No question. Pork over beef all day.",
            "author": "Yooooooooooo0o",
            "score": 1,
            "created_utc": 1728743754,
            "parent_id": "t1_lrgauhf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrig5px",
            "body": "Perry's pork chop is incredible. Add in the applesauce snf fuck yes.",
            "author": "crabby-owlbear",
            "score": 11,
            "created_utc": 1728701468,
            "parent_id": "t1_lrfp6ta",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgu3kx",
            "body": "Honestly tell me what's so great about Perry's? I've only been once, two of us ate and the bill was over $200 not including tip. The pork chop was tough, the ribeye steak was just okay and the sides were forgettable. I will say it was the Domain location and I've only been once but I was super unimpressed.  It's just not worth the price.",
            "author": "AnnieB512",
            "score": 3,
            "created_utc": 1728678482,
            "parent_id": "t1_lrfp6ta",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrifho4",
            "body": "Huge difference between the Domain and downtown location in my experience. Been a few years since I was last there but the downtown location I've eaten a few times and had good experiences each time. The Domain location was terrible for me",
            "author": "tzejin",
            "score": 5,
            "created_utc": 1728701173,
            "parent_id": "t1_lrgu3kx",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjgas7",
            "body": "I've had the pork chop over a dozen times at three different locations across Texas. Never once was it tough.\n\nNormally, Perry's is an expensive place. I mean, they charge $14 for a house Caesar salad! However, the Friday pork chop special is just that, damn special! If you can refrain from ordering apps, cocktails, starter salads, and dessert, a $20 meal that could easily be split into two portions is a big win in 2024.",
            "author": "Stickyv35",
            "score": 3,
            "created_utc": 1728723180,
            "parent_id": "t1_lrgu3kx",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjx7hn",
            "body": "And they serve shriveled up hamburgers that are 2 inches too small for the bun.",
            "author": "finger_foodie",
            "score": 2,
            "created_utc": 1728734116,
            "parent_id": "t1_lrgu3kx",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri4mc9",
            "body": "Both excellent, can't compare prime rib vs porkchop though.",
            "author": "ac_slat3r",
            "score": 1,
            "created_utc": 1728696489,
            "parent_id": "t1_lrfp6ta",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrj5ndp",
            "body": "Perry's pork chop is half the size it used to be.  And it used to be great, like pre 2012, it's a far cry from what it used to be.  My last few visits there have been horrible.  Dried overcooked and salty small pork chop, haven't been back since 2021.",
            "author": "elibutton",
            "score": -1,
            "created_utc": 1728715634,
            "parent_id": "t1_lrfp6ta",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrk3ji8",
            "body": "Back in the day, I think the $12 lunch chop was the same 3-4 bone 32oz chop they serve at dinner. Now it is a 2 bone 18oz chop that goes for $19. So definitely not the deal it used to be.\n\nI don't think that it is small in absolute terms but certainly smaller than it used to be.\n\nThe big loss for me was when they stopped carving it table side.",
            "author": "Tweedle_DeeDum",
            "score": 2,
            "created_utc": 1728737116,
            "parent_id": "t1_lrj5ndp",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgmrdq",
            "body": "Yeah, we get it, it's a great pork chop and good deal.\n\nBut how many times are you gonna post about it here?\n\nAre you a Perry's employee???",
            "author": "kanyeguisada",
            "score": -16,
            "created_utc": 1728676025,
            "parent_id": "t1_lrfp6ta",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh0eik",
            "body": "I think I was just participating in a conversation, in an agreeable and polite manner.\n\nYou should try it.\n\nNot affiliated with Perry's.",
            "author": "Tweedle_DeeDum",
            "score": 14,
            "created_utc": 1728680626,
            "parent_id": "t1_lrgmrdq",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh15ru",
            "body": "&gt;I think I was just participating in a conversation\n\nWhich you keep doing over and over and over in this sub about their pork chop.\n\nWe all already know it's a good pork chop, Perry's employee.",
            "author": "kanyeguisada",
            "score": -18,
            "created_utc": 1728680892,
            "parent_id": "t1_lrh0eik",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh1vl5",
            "body": "Can you guys just go on a date already.\n\n\nI recommend Perry's ",
            "author": "z64_dan",
            "score": 19,
            "created_utc": 1728681142,
            "parent_id": "t1_lrh15ru",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh5hr1",
            "body": "I've heard their pork chop is pretty good.",
            "author": "kanyeguisada",
            "score": -8,
            "created_utc": 1728682427,
            "parent_id": "t1_lrh1vl5",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh3amy",
            "body": "I'll post what I like and when I like, Karen.  But this conversation is clearly not value-added so feel free to have the last word.",
            "author": "Tweedle_DeeDum",
            "score": 10,
            "created_utc": 1728681638,
            "parent_id": "t1_lrh15ru",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh5ryd",
            "body": "No u.",
            "author": "kanyeguisada",
            "score": -5,
            "created_utc": 1728682528,
            "parent_id": "t1_lrh3amy",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfwgya",
            "body": "Try looking for a moist one. They're much better!",
            "author": "Reddit_Commenter_69",
            "score": 43,
            "created_utc": 1728667346,
            "parent_id": "t1_lrftnvn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfy6qi",
            "body": "I have had some dry ones on occasion as well.  Unfortunately, the overall quality and experience at Perry's has declined even as the price has gone up. But it is still a pretty great lunch special.",
            "author": "Tweedle_DeeDum",
            "score": 12,
            "created_utc": 1728667900,
            "parent_id": "t1_lrftnvn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrggzjo",
            "body": "I've had the opposite problem with the Brussel sprouts.  You can send them back if they are not done correctly.",
            "author": "Tweedle_DeeDum",
            "score": 1,
            "created_utc": 1728674071,
            "parent_id": "t1_lrgd4xr",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lriowpi",
            "body": "It's probably all the money Chris Perry is spending on all the lawsuits. All of his many, many, *many* lawsuits for wage theft.",
            "author": "ApprehensiveHippo401",
            "score": 1,
            "created_utc": 1728705684,
            "parent_id": "t1_lrfy6qi",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg44xt",
            "body": "This. It’s a terrible way to cook a pork chop. It’s not even worth keeping the leftovers the few times I’ve been.",
            "author": "stevendaedelus",
            "score": -8,
            "created_utc": 1728669825,
            "parent_id": "t1_lrftnvn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrmmwdy",
            "body": "Thanks. Apparently we committed heresy by saying it’s often dry",
            "author": "canofspam2020",
            "score": 2,
            "created_utc": 1728769206,
            "parent_id": "t1_lrg44xt",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrn038v",
            "body": "Fuck em if they like a poorly cooked pork chop.",
            "author": "stevendaedelus",
            "score": 1,
            "created_utc": 1728774244,
            "parent_id": "t1_lrmmwdy",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfp6g7",
            "body": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
            "author": "WelcomeToBrooklandia",
            "score": 110,
            "created_utc": 1728665000,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg0vke",
            "body": "Habanero lunch special prices make you feel like you time traveled back to 2011.",
            "author": "austinoracle",
            "score": 32,
            "created_utc": 1728668774,
            "parent_id": "t1_lrfp6g7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg5lml",
            "body": "Beef fajita ranchera plate is king of the lunch specials for me. 🫶🏼",
            "author": "Coujelais",
            "score": 13,
            "created_utc": 1728670300,
            "parent_id": "t1_lrfp6g7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri4iq4",
            "body": "I love that little spot.",
            "author": "starillin",
            "score": 2,
            "created_utc": 1728696448,
            "parent_id": "t1_lrg5lml",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri4y07",
            "body": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥️♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
            "author": "Coujelais",
            "score": 5,
            "created_utc": 1728696630,
            "parent_id": "t1_lri4iq4",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri1173",
            "body": "Chilakillers gigantic burrito plate for 6.99. Nuff said",
            "author": "ChickonKiller",
            "score": 6,
            "created_utc": 1728694951,
            "parent_id": "t1_lrfp6g7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfzeat",
            "body": "Prime rib is a roast, not a steak.",
            "author": "sqweak",
            "score": -26,
            "created_utc": 1728668296,
            "parent_id": "t1_lrfp6g7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg0ihy",
            "body": "OK? My point still stands. \n\n\"You're still getting an excellent BEEF meal for $35.\" Feel better now?",
            "author": "WelcomeToBrooklandia",
            "score": 27,
            "created_utc": 1728668657,
            "parent_id": "t1_lrfzeat",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfuod7",
            "body": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
            "author": "genteelbartender",
            "score": 83,
            "created_utc": 1728666767,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg46x1",
            "body": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
            "author": "RoleModelsinBlood31",
            "score": 32,
            "created_utc": 1728669843,
            "parent_id": "t1_lrfuod7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg62bj",
            "body": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
            "author": "genteelbartender",
            "score": 9,
            "created_utc": 1728670454,
            "parent_id": "t1_lrg46x1",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg7x0s",
            "body": "Yep, they’re pretty consistent, and busy as hell.  I really don’t think I’ve ever been there when it’s not packed all times of the day.  Just reminds me of all the fairly priced places from the 90’s that didn’t knock your socks off or did anything mind blowing but they were always consistent and had good food",
            "author": "RoleModelsinBlood31",
            "score": 14,
            "created_utc": 1728671066,
            "parent_id": "t1_lrg62bj",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjh8q0",
            "body": "100%. It feels nostalgic, which post-Covid is a welcomed feeling! It's the go-to in the budget category for us.\n\nYou're making me want to buy some shares, too!",
            "author": "Stickyv35",
            "score": 3,
            "created_utc": 1728723861,
            "parent_id": "t1_lrg7x0s",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg82ss",
            "body": "Tx Roadhouse is basically the new Lubys.",
            "author": "genteelbartender",
            "score": 1,
            "created_utc": 1728671118,
            "parent_id": "t1_lrg7x0s",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgidu1",
            "body": "comparing a place that offers steaks and whatnot to a place that is cafeteria food is wild.",
            "author": "__vheissu__",
            "score": 5,
            "created_utc": 1728674539,
            "parent_id": "t1_lrg82ss",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgj393",
            "body": "You clearly never went to Lubys in its heyday. Lubys is country food, just like Texas Roadhouse. But also, I challenge you to go to each place around 4pm and tell me it’s not the same demo.",
            "author": "genteelbartender",
            "score": 13,
            "created_utc": 1728674780,
            "parent_id": "t1_lrgidu1",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgj84g",
            "body": "I’m not 80 years old, I didnt get to experience their “heyday”.",
            "author": "__vheissu__",
            "score": -8,
            "created_utc": 1728674826,
            "parent_id": "t1_lrgj393",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjhgtc",
            "body": "Neither am I. But I do remember Luby's being fantastic in the late 90's, early 2000's. It started to change around the 2010's IMO.",
            "author": "Stickyv35",
            "score": 2,
            "created_utc": 1728724024,
            "parent_id": "t1_lrgj84g",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg63c6",
            "body": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
            "author": "genteelbartender",
            "score": 2,
            "created_utc": 1728670463,
            "parent_id": "t1_lrg46x1",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg81yv",
            "body": "I went bc i was on a road trip. It's pretty middling quality. Rolls are great.",
            "author": "OhYerSoKew",
            "score": 2,
            "created_utc": 1728671111,
            "parent_id": "t1_lrg46x1",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjh0n4",
            "body": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
            "author": "Stickyv35",
            "score": 1,
            "created_utc": 1728723698,
            "parent_id": "t1_lrg46x1",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgm3rj",
            "body": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
            "author": "slamminsalmoncannon",
            "score": 8,
            "created_utc": 1728675806,
            "parent_id": "t1_lrfuod7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg1s92",
            "body": "Jack Allen’s happy hour is half off apps. You can get literally every app, like 8 different ones, for like $50. It’s a ton of food and a great deal.",
            "author": "IAmSportikus",
            "score": 31,
            "created_utc": 1728669064,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrj153e",
            "body": "Fonda San Miguel used to do this. Was an awesome deal.",
            "author": "genteelbartender",
            "score": 5,
            "created_utc": 1728712668,
            "parent_id": "t1_lrg1s92",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkdfp1",
            "body": "What happened to JA? Went to the oak hill one like always last month and it was terrible. Seemed like a change in food supply, chicken was smaller dry pieces, gravy and CFS sucked. Was embarrassed I took some visiting family there.",
            "author": "macgrubersir",
            "score": 0,
            "created_utc": 1728741203,
            "parent_id": "t1_lrg1s92",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfthzm",
            "body": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
            "author": "longhorn_2017",
            "score": 26,
            "created_utc": 1728666386,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfxhh3",
            "body": "Is the prime rib/potato deal also on the lunch menu?",
            "author": "megaphoneXX",
            "score": 3,
            "created_utc": 1728667672,
            "parent_id": "t1_lrfthzm",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfz7kn",
            "body": "I believe it's only on the lunch menu!",
            "author": "longhorn_2017",
            "score": 2,
            "created_utc": 1728668234,
            "parent_id": "t1_lrfxhh3",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgfw54",
            "body": "is that only Fridays?",
            "author": "FakeEmpire20",
            "score": 2,
            "created_utc": 1728673703,
            "parent_id": "t1_lrfthzm",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrghyvm",
            "body": "Yes, they're only open for lunch on Friday.",
            "author": "longhorn_2017",
            "score": 4,
            "created_utc": 1728674399,
            "parent_id": "t1_lrgfw54",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfqypm",
            "body": "HUGE pork-chop at Perry’s in domain or 7th Street is the best special \nback in my day, price was about $14… now it’s up to $19… Rambles about inflation 😝",
            "author": "Beneficial-Stable-66",
            "score": 26,
            "created_utc": 1728665569,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri5neu",
            "body": "I remember having it when it was $11. If it was never $11, then I don’t know what I remember. I’m old. But even as a person who doesn’t generally like pork, it actually is quite good.",
            "author": "leavinonajetplane7",
            "score": 2,
            "created_utc": 1728696939,
            "parent_id": "t1_lrfqypm",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjhtmt",
            "body": "In before that one guy drop by bitching that you're a Perry's employee or something! 🤣",
            "author": "Stickyv35",
            "score": 2,
            "created_utc": 1728724284,
            "parent_id": "t1_lrfqypm",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgdaji",
            "body": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
            "author": "Open-EyedTraveler",
            "score": 24,
            "created_utc": 1728672839,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgipxt",
            "body": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
            "author": "WelcomeToBrooklandia",
            "score": 12,
            "created_utc": 1728674654,
            "parent_id": "t1_lrgdaji",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlwx6z",
            "body": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
            "author": "Open-EyedTraveler",
            "score": 1,
            "created_utc": 1728760093,
            "parent_id": "t1_lrgipxt",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrij949",
            "body": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
            "author": "laffs4jeffy",
            "score": 7,
            "created_utc": 1728702903,
            "parent_id": "t1_lrgdaji",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrt967k",
            "body": "They also do a steak night on Sundays! Love Hillside.",
            "author": "FakeEmpire20",
            "score": 1,
            "created_utc": 1728869209,
            "parent_id": "t1_lrgdaji",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgn98r",
            "body": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
            "author": "kanyeguisada",
            "score": 25,
            "created_utc": 1728676191,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrj1e65",
            "body": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
            "author": "modernmovements",
            "score": 3,
            "created_utc": 1728712826,
            "parent_id": "t1_lrgn98r",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrip6oa",
            "body": "Interesting",
            "author": "Arty_Puls",
            "score": 2,
            "created_utc": 1728705828,
            "parent_id": "t1_lrgn98r",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfq0jn",
            "body": "Carve lunch deal rivals it. \n\nBut a prime rib like my dad ate..",
            "author": "IdeaJason",
            "score": 18,
            "created_utc": 1728665267,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfqw49",
            "body": "Whats this deal?",
            "author": "Street-Ask5154",
            "score": 3,
            "created_utc": 1728665547,
            "parent_id": "t1_lrfq0jn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfsm6j",
            "body": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
            "author": "IdeaJason",
            "score": 20,
            "created_utc": 1728666097,
            "parent_id": "t1_lrfqw49",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfzqe7",
            "body": "This has been my go to Friday lunch for a while. IMO it’s the best steak special in town.",
            "author": "sqweak",
            "score": 1,
            "created_utc": 1728668405,
            "parent_id": "t1_lrfsm6j",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg090q",
            "body": "And quite possibly the finest cut of meat for the price I've ever encountered.",
            "author": "IdeaJason",
            "score": 2,
            "created_utc": 1728668571,
            "parent_id": "t1_lrfzqe7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh8960",
            "body": "How is the smokiness of that New York strip? Sounds really good. \n\nEdit: Never had a smoked steak!",
            "author": "ActionPerkins",
            "score": 1,
            "created_utc": 1728683433,
            "parent_id": "t1_lrg090q",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfsnb8",
            "body": "From the website: Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19 every Friday (11am to 5pm)",
            "author": "MilesandOz",
            "score": 7,
            "created_utc": 1728666107,
            "parent_id": "t1_lrfqw49",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lu3s7qg",
            "body": "Yup this is the move ",
            "author": "melvinmayhem1337",
            "score": 2,
            "created_utc": 1730077130,
            "parent_id": "t1_lrfq0jn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfy5gn",
            "body": "Free prime rib at palazio. Every first Friday.",
            "author": "PristineDriver6485",
            "score": 17,
            "created_utc": 1728667889,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhref5",
            "body": "You not gonna walk out of there spending less than $19.  LOL",
            "author": "TX_spacegeek",
            "score": 11,
            "created_utc": 1728690968,
            "parent_id": "t1_lrfy5gn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrge61r",
            "body": "This looks like the food we give patients with swallowing issues, in the hospital.  😬",
            "author": "lawlislr",
            "score": 18,
            "created_utc": 1728673127,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrie17a",
            "body": "And as pictured I think it's $35 where their wording seems purposefully obtuse to make it seem as if it's actually $19.",
            "author": "Econolife-350",
            "score": 8,
            "created_utc": 1728700559,
            "parent_id": "t1_lrge61r",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkdwwk",
            "body": "Prime rib for swallowing issues lolol",
            "author": "Coujelais",
            "score": 2,
            "created_utc": 1728741390,
            "parent_id": "t1_lrge61r",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfryrh",
            "body": "Polazios 1st Friday’s $10 prime rib.",
            "author": "LongShotLives",
            "score": 20,
            "created_utc": 1728665888,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgg7ey",
            "body": "Yes",
            "author": "LongShotLives",
            "score": 7,
            "created_utc": 1728673807,
            "parent_id": "t1_lrgd76l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhj4rv",
            "body": "Do I have to pay to enter the club? Or can I just go in, eat my meat and leave ?",
            "author": "PrizeNo2127",
            "score": 4,
            "created_utc": 1728687624,
            "parent_id": "t1_lrfryrh",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhlwb5",
            "body": "Yeah. Go in and eat and leave. No one is going to keep you there. No 2 drink minimum if that’s what you are worried about.",
            "author": "LongShotLives",
            "score": 4,
            "created_utc": 1728688728,
            "parent_id": "t1_lrhj4rv",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri23ih",
            "body": "I was worried I would have to buy a lap dance too",
            "author": "PrizeNo2127",
            "score": 7,
            "created_utc": 1728695408,
            "parent_id": "t1_lrhlwb5",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri6mkd",
            "body": "That’s up to you friendo 😉",
            "author": "LongShotLives",
            "score": 6,
            "created_utc": 1728697360,
            "parent_id": "t1_lri23ih",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrwczkm",
            "body": "\\*beat",
            "author": "red_ocean5",
            "score": 1,
            "created_utc": 1728923824,
            "parent_id": "t1_lrhj4rv",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgk608",
            "body": "Be honest , you don’t go to polazios because of the prime rib.",
            "author": "pompom_waver",
            "score": 4,
            "created_utc": 1728675147,
            "parent_id": "t1_lrfryrh",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgmzdw",
            "body": "Prime rib with a view😎",
            "author": "LongShotLives",
            "score": 11,
            "created_utc": 1728676100,
            "parent_id": "t1_lrgk608",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgxidm",
            "body": "Steak &amp; Leggs",
            "author": "PristineDriver6485",
            "score": 15,
            "created_utc": 1728679627,
            "parent_id": "t1_lrgmzdw",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgy5yh",
            "body": "I like yo style my friend. 🤘🏽",
            "author": "LongShotLives",
            "score": 7,
            "created_utc": 1728679851,
            "parent_id": "t1_lrgxidm",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri3zqp",
            "body": "Tits 'n' Taters",
            "author": "Flaky_Floor_6390",
            "score": 6,
            "created_utc": 1728696219,
            "parent_id": "t1_lrgxidm",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfm0kg",
            "body": "Damn that is a good deal I really wish I wasn't working today",
            "author": "titos334",
            "score": 12,
            "created_utc": 1728663970,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfswd5",
            "body": "What does \"both sides\" mean? What does \"opt in\" mean?\n\nWhat do you mean by \"otherwise\" I'm so confused lol",
            "author": "EbagI",
            "score": 10,
            "created_utc": 1728666190,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrft9jt",
            "body": "The prime rib is 19$. The potatoes and creamed kale are sides. You can may 8$ for each of them. Otherwise would mean you didn’t add them.",
            "author": "Street-Ask5154",
            "score": 4,
            "created_utc": 1728666310,
            "parent_id": "t1_lrfswd5",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrftnb9",
            "body": "Jesus Christ, I completely did not understand \"sides\" as in, side dishes 😂 \n\nCompletely me being an idiot. I have no idea why I did not understand that, thank you so much for spelling it out ❤️ thank you for the post in general",
            "author": "EbagI",
            "score": 21,
            "created_utc": 1728666434,
            "parent_id": "t1_lrft9jt",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfwgmw",
            "body": "You are not alone. For some reason I was confused by the wording as well. I thought both sides referred to the restaurant having two entrances or something lol, or both sides of the beef maybe?",
            "author": "funkmastamatt",
            "score": 8,
            "created_utc": 1728667344,
            "parent_id": "t1_lrftnb9",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgaqkb",
            "body": "Me three..  At first I thought OP meant both sides of the prime rib.  Lol.",
            "author": "llamawc77",
            "score": 3,
            "created_utc": 1728671996,
            "parent_id": "t1_lrfwgmw",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh3e4s",
            "body": "I initially read that as both sides of the prime rib are terrific 😂",
            "author": "trainwreckchococat",
            "score": 3,
            "created_utc": 1728681672,
            "parent_id": "t1_lrftnb9",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg0qtx",
            "body": "Op forgot to mention they charge an arm and a leg for the sides.  The prime rib special is just that.  \nAs shown I think it’s a 30-35 dollar plate. So he’ll no. I went there once.",
            "author": "AutofillUserID",
            "score": 10,
            "created_utc": 1728668732,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg1ccu",
            "body": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
            "author": "WelcomeToBrooklandia",
            "score": 6,
            "created_utc": 1728668924,
            "parent_id": "t1_lrg0qtx",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh0oja",
            "body": "Not really a deal at $35.  It’s ok normal pricing for the location. The Perry Friday special is mad popular.  \nMaie Day is just not busy with their special that’s been there for a long time.",
            "author": "AutofillUserID",
            "score": 6,
            "created_utc": 1728680724,
            "parent_id": "t1_lrg1ccu",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh1fba",
            "body": "Perry's has been around a lot longer than Maie Day. Makes sense that their special is more popular/well-known. \n\n$35 for a beautifully-cooked 10-oz prime rib with two sides is a good deal. You can't get anything comparable in that area at that quality for that price. \n\nBeing negative for the sake of being negative isn't the flex that you seem to think it is.",
            "author": "WelcomeToBrooklandia",
            "score": -2,
            "created_utc": 1728680984,
            "parent_id": "t1_lrh0oja",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrizy2a",
            "body": "I believe the original issue wasn’t the $35. It’s that the post is worded in a way that makes it seem you get all that for $19.",
            "author": "QuestoPresto",
            "score": 1,
            "created_utc": 1728711923,
            "parent_id": "t1_lrh1fba",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjy99y",
            "body": "Yup.  The prime rib is cooked really well and they have the process dial down. I would recommend it to anyone who likes prime rib.  The service is also really good.",
            "author": "AutofillUserID",
            "score": 1,
            "created_utc": 1728734640,
            "parent_id": "t1_lrizy2a",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhpj8u",
            "body": "Best bang for your buck has to be Schlotzsky’s buy one get one free pizza on Wednesdays. Basically $5 per pizza. Cheaper than dominos",
            "author": "BigBoiBenisBlueBalls",
            "score": 5,
            "created_utc": 1728690205,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri0is1",
            "body": "I didn’t know about that, is that any location? Also, I’m literally still sad that they took away the pesto sauce, their new generic tomato sauce is such a bummer lol. ",
            "author": "Abysstreadr",
            "score": 2,
            "created_utc": 1728694737,
            "parent_id": "t1_lrhpj8u",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri14zz",
            "body": "Yeah any location on Wednesday’s. Also $5 pizzas after 5pm Friday Saturday Sunday with is the same thing but I’m not sure how long that offer is good for. The Wednesday one is forever. Hmm I like it 🤔",
            "author": "BigBoiBenisBlueBalls",
            "score": 1,
            "created_utc": 1728694996,
            "parent_id": "t1_lri0is1",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgyby5",
            "body": "You should have gone to Luby's instead.",
            "author": "Remarkable-Bid-7471",
            "score": 4,
            "created_utc": 1728679908,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri78p5",
            "body": "This thread is a godsend!",
            "author": "BeerIsTheMindSpiller",
            "score": 5,
            "created_utc": 1728697620,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlg436",
            "body": "I’m jealous Dallas doesn’t have a sub for this.",
            "author": "Admirable_Basket381",
            "score": 2,
            "created_utc": 1728754541,
            "parent_id": "t1_lri78p5",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfom5l",
            "body": "that's where that motorcycle shop is/was?",
            "author": "leanmeanvagine",
            "score": 5,
            "created_utc": 1728664819,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfos4g",
            "body": "I guess I’m unfamiliar with that. It’s at the corner of Monroe and Congress",
            "author": "Street-Ask5154",
            "score": 3,
            "created_utc": 1728664872,
            "parent_id": "t1_lrfom5l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfy5b3",
            "body": "No its where Central Standard was",
            "author": "SecretHeroes",
            "score": 0,
            "created_utc": 1728667887,
            "parent_id": "t1_lrfos4g",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg4h8y",
            "body": "No. Across the little outdoor entrance area.",
            "author": "stevendaedelus",
            "score": 2,
            "created_utc": 1728669935,
            "parent_id": "t1_lrfom5l",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg7gmc",
            "body": "Ah yeah, that's what I meant.  I had a Monte Cristo there before...was pretty good.\n\nFor my mouth, that is, not my arteries.",
            "author": "leanmeanvagine",
            "score": 3,
            "created_utc": 1728670918,
            "parent_id": "t1_lrg4h8y",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrggeej",
            "body": "Yellow Rose prime rib",
            "author": "Bulk-of-the-Series",
            "score": 4,
            "created_utc": 1728673873,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfygmz",
            "body": "Ya $35 as a “special” ain’t it 😂 and if it’s good, that’s the first thing that’s good at that spot",
            "author": "PristineDriver6485",
            "score": 3,
            "created_utc": 1728667990,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhowlg",
            "body": "This looks awful",
            "author": "iamjay92",
            "score": 3,
            "created_utc": 1728689945,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlrx5i",
            "body": "Took me way too long scrolling to find a comment saying this lol. That plate looks revolting asf",
            "author": "1Dzach",
            "score": 3,
            "created_utc": 1728758430,
            "parent_id": "t1_lrhowlg",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhug9y",
            "body": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
            "author": "milli_138",
            "score": 3,
            "created_utc": 1728692231,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrifwa2",
            "body": "What's the last time you went? \n\nWe went about a year and a half ago and while they had a happy hour up on their website, they said they stopped doing that since covid and wound up spending $30 on some mediocre entrees and drinks that were 3X the price listed for that time online.\n\nHaven't bothered with it since, but the atmosphere seemed great and the employees were fantastic so we had a good time and made a mental note that it was more of a decent occasional date night place rather than the land of the killer happy-hour we had heard of.",
            "author": "Econolife-350",
            "score": 1,
            "created_utc": 1728701351,
            "parent_id": "t1_lrhug9y",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrivtjz",
            "body": "I’d have to look up what show it was for when we last went. I would guess within the past two months? You do have to sit at that cool bar way in the back. Not the one you can see when you enter.  I thought it was a rare amount of craftsmenship and once I learned the story of the bar I was really impressed with it, honestly.",
            "author": "milli_138",
            "score": 2,
            "created_utc": 1728709457,
            "parent_id": "t1_lrifwa2",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrirdbo",
            "body": "Long time Perry’s pork chop eater, first time poster. I am a HUGE steak person. I will admit, if I’m attending Perry’s on the company dime, I will usually order beef. HOWEVER until I tried the Perry’s pork chop I have never had a moist and tender pork dish. Man oh man did Perry’s prove my assumptions wrong. Their Friday special is not only a great deal but also delicious.",
            "author": "ObligationSquare6318",
            "score": 3,
            "created_utc": 1728706990,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlahsu",
            "body": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
            "author": "DrippingAgent",
            "score": 2,
            "created_utc": 1728752713,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lro6uqc",
            "body": "Bruh never had the Pork Chop friday special at Perrys.",
            "author": "Lobster_Donkey_36",
            "score": 3,
            "created_utc": 1728791853,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfu1bn",
            "body": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
            "author": "Front-Statement-1636",
            "score": 1,
            "created_utc": 1728666561,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg4mt9",
            "body": "What’s the pipe hit?",
            "author": "RoleModelsinBlood31",
            "score": 1,
            "created_utc": 1728669985,
            "parent_id": "t1_lrfu1bn",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri4phi",
            "body": "Yo' mama",
            "author": "Flaky_Floor_6390",
            "score": 4,
            "created_utc": 1728696527,
            "parent_id": "t1_lrg4mt9",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg29zb",
            "body": "Are all the specials beef and pork chop related?",
            "author": "barrorg",
            "score": 2,
            "created_utc": 1728669220,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkhs0s",
            "body": "Palazzio’s men club first Friday of every month between 12-3 free prime rib included with $10 cover charge.",
            "author": "El_Sueno56",
            "score": 2,
            "created_utc": 1728742841,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrmhmjk",
            "body": "Is it good?",
            "author": "Street-Ask5154",
            "score": 1,
            "created_utc": 1728767285,
            "parent_id": "t1_lrkhs0s",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrz9nee",
            "body": "lol it’s edible but you get to look at nude tits",
            "author": "El_Sueno56",
            "score": 1,
            "created_utc": 1728959445,
            "parent_id": "t1_lrmhmjk",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrzbilb",
            "body": "Nothin better then nude tits",
            "author": "Street-Ask5154",
            "score": 1,
            "created_utc": 1728960153,
            "parent_id": "t1_lrz9nee",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrfvdnj",
            "body": "Josephine House’s steak night on Monday’s is fantastic",
            "author": "ptran90",
            "score": 1,
            "created_utc": 1728666995,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri5uyn",
            "body": "Comments like this make me so sad I can’t go out to dinner at the drop of a hat anymore bc of young children. Oh well. One day again.",
            "author": "leavinonajetplane7",
            "score": 3,
            "created_utc": 1728697030,
            "parent_id": "t1_lrfvdnj",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlayen",
            "body": "Yes, it depends on the cut you get. It’s unlimited wine too haha unless they have changed it",
            "author": "ptran90",
            "score": 1,
            "created_utc": 1728752864,
            "parent_id": "t1_lrk1zld",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhvymt",
            "body": "Yum 😋",
            "author": "MsMo999",
            "score": 1,
            "created_utc": 1728692854,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhwojq",
            "body": "Is Fennario Flats still playing that Friday lunch?",
            "author": "Sparkadelic007",
            "score": 1,
            "created_utc": 1728693152,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lria93g",
            "body": "Whats...uh..nuzzling..embracing? Supporting!  the questionable meat piece? Creamed spinach. Potato puree and something else I can't make out.",
            "author": "MongooseOk941",
            "score": 1,
            "created_utc": 1728698916,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkeaem",
            "body": "Horseradish",
            "author": "Coujelais",
            "score": 2,
            "created_utc": 1728741533,
            "parent_id": "t1_lria93g",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrk5jkk",
            "body": "Tumble 22 happy hour sandwich + 1 side for ..$8?",
            "author": "masterbirder",
            "score": 1,
            "created_utc": 1728737983,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlcqf1",
            "body": "super burrito on tuesdays ",
            "author": "Objective_Roof_8539",
            "score": 1,
            "created_utc": 1728753444,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrol3qk",
            "body": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
            "author": "Money-Information-99",
            "score": 1,
            "created_utc": 1728799621,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrlg6dg",
            "body": "Man, I've never heard of this maies daies place. Gotta check-in out!",
            "author": "AffectionatePie8588",
            "score": 0,
            "created_utc": 1728754562,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrg2f0v",
            "body": "it looks like someone made a diaper out of a steak but I would still eat the shit out of that. It looks amazing",
            "author": "yourdadsboyfie",
            "score": -3,
            "created_utc": 1728669265,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrji7io",
            "body": "Hmm, my tired brain initially understood that as you'd eat the shit out of a diaper.\n\nYikes.",
            "author": "Stickyv35",
            "score": 2,
            "created_utc": 1728724567,
            "parent_id": "t1_lrg2f0v",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhqzd7",
            "body": "Awesome deal.  That’s almost the same cost as two Torchy’s tacos and a soda.",
            "author": "TX_spacegeek",
            "score": -1,
            "created_utc": 1728690796,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri89gm",
            "body": "Their mass produced tortillas in bulk are the absolute worst.  Gross",
            "author": "ganczha",
            "score": 4,
            "created_utc": 1728698060,
            "parent_id": "t1_lrhqzd7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrif3u2",
            "body": "To be fair, as pictured it's $35 which I find funny they don't mention.",
            "author": "Econolife-350",
            "score": 3,
            "created_utc": 1728701008,
            "parent_id": "t1_lrhqzd7",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri6vt6",
            "body": "Maie Day bitches",
            "author": "Gabby692024",
            "score": -3,
            "created_utc": 1728697468,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lriz3q0",
            "body": "Anything at Torchys",
            "author": "StoreRevolutionary70",
            "score": -2,
            "created_utc": 1728711403,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri2sw8",
            "body": "That’s so raw 🤢",
            "author": "Doonesbury",
            "score": -6,
            "created_utc": 1728695712,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrjiad0",
            "body": "Well-done beef is best ordered at Golden Corral.",
            "author": "Stickyv35",
            "score": 1,
            "created_utc": 1728724625,
            "parent_id": "t1_lri2sw8",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrk6bsu",
            "body": "It doesn’t have to be well done, just not raw, man.",
            "author": "Doonesbury",
            "score": 0,
            "created_utc": 1728738317,
            "parent_id": "t1_lrjiad0",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrkehty",
            "body": "Prime rib literally always looks like that",
            "author": "Coujelais",
            "score": 3,
            "created_utc": 1728741615,
            "parent_id": "t1_lrk6bsu",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrgz7bt",
            "body": "Why does everything in Texas come in a pool of beans",
            "author": "lateseasondad",
            "score": -9,
            "created_utc": 1728680209,
            "parent_id": "t3_1g1dspf",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh1oyd",
            "body": "That's au jus. No beans on that plate.",
            "author": "WelcomeToBrooklandia",
            "score": 10,
            "created_utc": 1728681078,
            "parent_id": "t1_lrgz7bt",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrh6wis",
            "body": "What a moron 🤦🏻‍♀️😂",
            "author": "Wonderful-Distance51",
            "score": -1,
            "created_utc": 1728682937,
            "parent_id": "t1_lrh1oyd",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrhvzbi",
            "body": "1.) Beans are delicious \n\n\n2.) Ain't beans",
            "author": "cflatjazz",
            "score": 5,
            "created_utc": 1728692861,
            "parent_id": "t1_lrgz7bt",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lri69xv",
            "body": "I too thought it was refried beans, as I’ve never had prime rib.",
            "author": "leavinonajetplane7",
            "score": 1,
            "created_utc": 1728697208,
            "parent_id": "t1_lrgz7bt",
            "permalink": "",
            "subreddit": "austinfood"
          },
          {
            "id": "t1_lrt9eqh",
            "body": "lolol thought this was a troll post til I read the other comments.",
            "author": "FakeEmpire20",
            "score": 1,
            "created_utc": 1728869305,
            "parent_id": "t1_lrgz7bt",
            "permalink": "",
            "subreddit": "austinfood"
          }
        ]
      }
    ]
  },
  "output": {
    "mentions": [
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_1",
        "dish_attributes": [
          "special",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_special",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T19:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "d_house_roasted_beef_rib",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T19:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
        "source_id": "t1_lrfuod7",
        "source_type": "comment",
        "temp_id": "m_3",
        "dish_attributes": [
          "cheap",
          "budget-friendly"
        ],
        "dish_categories": [
          "early dine menu",
          "menu"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Early Dine menu",
        "dish_primary_category": "early dine menu",
        "dish_temp_id": "d_early_dine_menu",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-10T19:52:47Z",
        "source_upvotes": 83,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
        "source_id": "t1_lrfuod7",
        "source_type": "comment",
        "temp_id": "m_4",
        "dish_attributes": null,
        "dish_categories": [
          "entree"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "entrees",
        "dish_primary_category": "entree",
        "dish_temp_id": "d_entree",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-10T19:52:47Z",
        "source_upvotes": 83,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
        "source_id": "t1_lrfuod7",
        "source_type": "comment",
        "temp_id": "m_5",
        "dish_attributes": [
          "cheap"
        ],
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "Sides",
        "dish_primary_category": "side",
        "dish_temp_id": "d_side",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-10T19:52:47Z",
        "source_upvotes": 83,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
        "source_id": "t1_lrg46x1",
        "source_type": "comment",
        "temp_id": "m_6",
        "dish_attributes": null,
        "dish_categories": [
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "18oz rib",
        "dish_primary_category": "rib",
        "dish_temp_id": "d_rib",
        "restaurant_attributes": [
          "consistent"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "roadhouse",
        "source_created_at": "2028-10-10T20:54:03Z",
        "source_upvotes": 32,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
        "source_id": "t1_lrg46x1",
        "source_type": "comment",
        "temp_id": "m_7",
        "dish_attributes": null,
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side",
        "dish_temp_id": "d_side_2",
        "restaurant_attributes": [
          "consistent"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "roadhouse",
        "source_created_at": "2028-10-10T20:54:03Z",
        "source_upvotes": 32,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
        "source_id": "t1_lrg62bj",
        "source_type": "comment",
        "temp_id": "m_8",
        "dish_attributes": null,
        "dish_categories": null,
        "dish_is_menu_item": null,
        "dish_original_text": null,
        "dish_primary_category": null,
        "dish_temp_id": null,
        "restaurant_attributes": null,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": null,
        "source_created_at": "2028-10-10T21:07:34Z",
        "source_upvotes": 9,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "Yep, they’re pretty consistent, and busy as hell.  I really don’t think I’ve ever been there when it’s not packed all times of the day.  Just reminds me of all the fairly priced places from the 90’s that didn’t knock your socks off or did anything mind blowing but they were always consistent and had good food",
        "source_id": "t1_lrg7x0s",
        "source_type": "comment",
        "temp_id": "m_9",
        "dish_attributes": null,
        "dish_categories": null,
        "dish_is_menu_item": null,
        "dish_original_text": null,
        "dish_primary_category": null,
        "dish_temp_id": null,
        "restaurant_attributes": [
          "consistent",
          "busy",
          "packed",
          "fairly priced",
          "good food"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": null,
        "source_created_at": "2028-10-10T21:17:46Z",
        "source_upvotes": 14,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "100%. It feels nostalgic, which post-Covid is a welcomed feeling! It's the go-to in the budget category for us.\n\nYou're making me want to buy some shares, too!",
        "source_id": "t1_lrjh8q0",
        "source_type": "comment",
        "temp_id": "m_10",
        "dish_attributes": null,
        "dish_categories": null,
        "dish_is_menu_item": null,
        "dish_original_text": null,
        "dish_primary_category": null,
        "dish_temp_id": null,
        "restaurant_attributes": [
          "nostalgic",
          "budget-friendly"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": null,
        "source_created_at": "2028-10-11T12:44:21Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I went bc i was on a road trip. It's pretty middling quality. Rolls are great.",
        "source_id": "t1_lrg81yv",
        "source_type": "comment",
        "temp_id": "m_11",
        "dish_attributes": [
          "great"
        ],
        "dish_categories": [
          "roll"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Rolls",
        "dish_primary_category": "roll",
        "dish_temp_id": "d_roll",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": null,
        "source_created_at": "2028-10-10T21:18:31Z",
        "source_upvotes": 2,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
        "source_id": "t1_lrjh0n4",
        "source_type": "comment",
        "temp_id": "m_12",
        "dish_attributes": null,
        "dish_categories": [
          "steak",
          "beef"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "steak",
        "dish_primary_category": "steak",
        "dish_temp_id": "d_steak",
        "restaurant_attributes": [
          "great value",
          "fun time",
          "great service"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-11T12:41:38Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
        "source_id": "t1_lrjh0n4",
        "source_type": "comment",
        "temp_id": "m_13",
        "dish_attributes": [
          "great marbling"
        ],
        "dish_categories": [
          "ribeye",
          "steak",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "ribeye",
        "dish_primary_category": "ribeye",
        "dish_temp_id": "d_ribeye",
        "restaurant_attributes": [
          "great value",
          "fun time",
          "great service"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-11T12:41:38Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
        "source_id": "t1_lrjh0n4",
        "source_type": "comment",
        "temp_id": "m_14",
        "dish_attributes": [
          "decent"
        ],
        "dish_categories": [
          "drink"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "drinks",
        "dish_primary_category": "drink",
        "dish_temp_id": "d_drink",
        "restaurant_attributes": [
          "great value",
          "fun time",
          "great service"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-11T12:41:38Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
        "source_id": "t1_lrjh0n4",
        "source_type": "comment",
        "temp_id": "m_15",
        "dish_attributes": null,
        "dish_categories": [
          "margarita",
          "drink"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "margs",
        "dish_primary_category": "margarita",
        "dish_temp_id": "d_margarita",
        "restaurant_attributes": [
          "great value",
          "fun time",
          "great service"
        ],
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "source_created_at": "2028-10-11T12:41:38Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
        "source_id": "t1_lrgm3rj",
        "source_type": "comment",
        "temp_id": "m_16",
        "dish_attributes": null,
        "dish_categories": [
          "roll"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "rolls",
        "dish_primary_category": "roll",
        "dish_temp_id": "d_roll_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Roadhouse",
        "source_created_at": "2028-10-10T21:43:26Z",
        "source_upvotes": 8,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_texas_roadhouse",
        "source_content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
        "source_id": "t1_lrgm3rj",
        "source_type": "comment",
        "temp_id": "m_17",
        "dish_attributes": [
          "with marshmallows"
        ],
        "dish_categories": [
          "sweet potato",
          "potato",
          "vegetable"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "sweet potato with marshmallows",
        "dish_primary_category": "sweet potato",
        "dish_temp_id": "d_sweet_potato_with_marshmallows",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Roadhouse",
        "source_created_at": "2028-10-10T21:43:26Z",
        "source_upvotes": 8,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "rest_maieday_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_post_1",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_primerib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "rest_maieday_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_post_2",
        "dish_attributes": [
          "house roasted",
          "roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_beefrib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "rest_jackallens_1",
        "source_content": "Jack Allen’s happy hour is half off apps. You can get literally every app, like 8 different ones, for like $50. It’s a ton of food and a great deal.",
        "source_id": "t1_lrg1s92",
        "source_type": "comment",
        "temp_id": "mention_comment_1",
        "dish_attributes": null,
        "dish_categories": [
          "appetizer"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "apps",
        "dish_primary_category": "appetizer",
        "dish_temp_id": "dish_appetizer_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "jack allen's",
        "restaurant_original_text": "Jack Allen’s",
        "source_created_at": "2024-10-10T16:31:04Z",
        "source_upvotes": 31,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_post_1",
        "dish_attributes": [
          "roasted",
          "house-made"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_lonesome_dove_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_2",
        "restaurant_attributes": [
          "lunch"
        ],
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove's",
        "source_created_at": "2024-10-10T15:46:26Z",
        "source_upvotes": 26,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_lonesome_dove_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_2",
        "dish_attributes": [
          "twice-baked"
        ],
        "dish_categories": [
          "potato"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "twice-baked potato",
        "dish_primary_category": "potato",
        "dish_temp_id": "dish_potato_1",
        "restaurant_attributes": [
          "lunch"
        ],
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove's",
        "source_created_at": "2024-10-10T15:46:26Z",
        "source_upvotes": 26,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_lonesome_dove_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_3",
        "dish_attributes": null,
        "dish_categories": [
          "burger"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger",
        "dish_primary_category": "burger",
        "dish_temp_id": "dish_burger_1",
        "restaurant_attributes": [
          "lunch"
        ],
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove's",
        "source_created_at": "2024-10-10T15:46:26Z",
        "source_upvotes": 26,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_lonesome_dove_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_4",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib sandwich",
          "sandwich",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib sandwich",
        "dish_primary_category": "prime rib sandwich",
        "dish_temp_id": "dish_prime_rib_sandwich_1",
        "restaurant_attributes": [
          "lunch"
        ],
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove's",
        "source_created_at": "2024-10-10T15:46:26Z",
        "source_upvotes": 26,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_t3_1g1dspf_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_t3_1g1dspf_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t1_lrfqypm_1",
        "source_content": "HUGE pork-chop at Perry’s in domain or 7th Street is the best special \nback in my day, price was about $14… now it’s up to $19… Rambles about inflation 😝",
        "source_id": "t1_lrfqypm",
        "source_type": "comment",
        "temp_id": "mention_t1_lrfqypm_1",
        "dish_attributes": [
          "huge"
        ],
        "dish_categories": [
          "pork chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork-chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_t1_lrfqypm_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry’s",
        "source_created_at": "2024-10-10T15:32:49Z",
        "source_upvotes": 26,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t1_lrfqypm_1",
        "source_content": "I remember having it when it was $11. If it was never $11, then I don’t know what I remember. I’m old. But even as a person who doesn’t generally like pork, it actually is quite good.",
        "source_id": "t1_lri5neu",
        "source_type": "comment",
        "temp_id": "mention_t1_lri5neu_1",
        "dish_attributes": [
          "quite good"
        ],
        "dish_categories": [
          "pork chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_t1_lrfqypm_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry’s",
        "source_created_at": "2024-10-10T23:02:19Z",
        "source_upvotes": 2,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_post_1",
        "dish_attributes": [],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_special_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_post_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "d_beef_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_post_3",
        "dish_attributes": null,
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side",
        "dish_temp_id": "d_sides_post_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_churchs_1",
        "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
        "source_id": "t1_lrgn98r",
        "source_type": "comment",
        "temp_id": "m_comment_1",
        "dish_attributes": [
          "texas"
        ],
        "dish_categories": [
          "texas two piece feast",
          "chicken",
          "feast"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Texas Two Piece Feast",
        "dish_primary_category": "texas two piece feast",
        "dish_temp_id": "d_texas_two_piece_feast_1",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "church's",
        "restaurant_original_text": "Church's",
        "source_created_at": "2028-10-10T18:29:51Z",
        "source_upvotes": 25,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_churchs_1",
        "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
        "source_id": "t1_lrgn98r",
        "source_type": "comment",
        "temp_id": "m_comment_2",
        "dish_attributes": null,
        "dish_categories": [
          "leg",
          "chicken"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Leg",
        "dish_primary_category": "leg",
        "dish_temp_id": "d_leg_1",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "church's",
        "restaurant_original_text": "Church's",
        "source_created_at": "2028-10-10T18:29:51Z",
        "source_upvotes": 25,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_churchs_1",
        "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
        "source_id": "t1_lrgn98r",
        "source_type": "comment",
        "temp_id": "m_comment_3",
        "dish_attributes": null,
        "dish_categories": [
          "thigh",
          "chicken"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "thigh",
        "dish_primary_category": "thigh",
        "dish_temp_id": "d_thigh_1",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "church's",
        "restaurant_original_text": "Church's",
        "source_created_at": "2028-10-10T18:29:51Z",
        "source_upvotes": 25,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_churchs_1",
        "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
        "source_id": "t1_lrgn98r",
        "source_type": "comment",
        "temp_id": "m_comment_4",
        "dish_attributes": null,
        "dish_categories": [
          "biscuit",
          "bread"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "biscuit",
        "dish_primary_category": "biscuit",
        "dish_temp_id": "d_biscuit_1",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "church's",
        "restaurant_original_text": "Church's",
        "source_created_at": "2028-10-10T18:29:51Z",
        "source_upvotes": 25,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_churchs_1",
        "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
        "source_id": "t1_lrgn98r",
        "source_type": "comment",
        "temp_id": "m_comment_5",
        "dish_attributes": null,
        "dish_categories": [
          "jalapeno",
          "pepper"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "jalapeno",
        "dish_primary_category": "jalapeno",
        "dish_temp_id": "d_jalapeno_1",
        "restaurant_attributes": [
          "budget-friendly",
          "great value"
        ],
        "restaurant_normalized_name": "church's",
        "restaurant_original_text": "Church's",
        "source_created_at": "2028-10-10T18:29:51Z",
        "source_upvotes": 25,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_popeyes_1",
        "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
        "source_id": "t1_lrj1e65",
        "source_type": "comment",
        "temp_id": "m_comment_6",
        "dish_attributes": null,
        "dish_categories": [
          "manager's special",
          "chicken",
          "meal"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "manager's special",
        "dish_primary_category": "manager's special",
        "dish_temp_id": "d_managers_special_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "popeye's",
        "restaurant_original_text": "Popeye's",
        "source_created_at": "2028-10-11T04:40:26Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_popeyes_1",
        "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
        "source_id": "t1_lrj1e65",
        "source_type": "comment",
        "temp_id": "m_comment_7",
        "dish_attributes": null,
        "dish_categories": [
          "chicken"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "chicken",
        "dish_primary_category": "chicken",
        "dish_temp_id": "d_chicken_comment2_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "popeye's",
        "restaurant_original_text": "Popeye's",
        "source_created_at": "2028-10-11T04:40:26Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_popeyes_1",
        "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
        "source_id": "t1_lrj1e65",
        "source_type": "comment",
        "temp_id": "m_comment_8",
        "dish_attributes": null,
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side",
        "dish_temp_id": "d_sides_comment2_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "popeye's",
        "restaurant_original_text": "Popeye's",
        "source_created_at": "2028-10-11T04:40:26Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_popeyes_1",
        "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
        "source_id": "t1_lrj1e65",
        "source_type": "comment",
        "temp_id": "m_comment_9",
        "dish_attributes": [
          "fried"
        ],
        "dish_categories": [
          "fried chicken",
          "chicken"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "fried chicken",
        "dish_primary_category": "fried chicken",
        "dish_temp_id": "d_fried_chicken_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "popeye's",
        "restaurant_original_text": "Popeye's",
        "source_created_at": "2028-10-11T04:40:26Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maieday_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_primerib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maieday_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "d_beefrib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
        "source_id": "t1_lrgdaji",
        "source_type": "comment",
        "temp_id": "m_t1_lrgdaji_1",
        "dish_attributes": null,
        "dish_categories": [
          "old fashion"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "old fashion",
        "dish_primary_category": "old fashion",
        "dish_temp_id": "d_oldfashion_1",
        "restaurant_attributes": [
          "casual"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": "hillside farmacy",
        "source_created_at": "2024-10-10T17:33:59Z",
        "source_upvotes": 24,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
        "source_id": "t1_lrgdaji",
        "source_type": "comment",
        "temp_id": "m_t1_lrgdaji_2",
        "dish_attributes": null,
        "dish_categories": [
          "burger"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger",
        "dish_primary_category": "burger",
        "dish_temp_id": "d_burger_1",
        "restaurant_attributes": [
          "casual"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": "hillside farmacy",
        "source_created_at": "2024-10-10T17:33:59Z",
        "source_upvotes": 24,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
        "source_id": "t1_lrgdaji",
        "source_type": "comment",
        "temp_id": "m_t1_lrgdaji_3",
        "dish_attributes": null,
        "dish_categories": [
          "fries"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "fries",
        "dish_primary_category": "fries",
        "dish_temp_id": "d_fries_1",
        "restaurant_attributes": [
          "casual"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": "hillside farmacy",
        "source_created_at": "2024-10-10T17:33:59Z",
        "source_upvotes": 24,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
        "source_id": "t1_lrgipxt",
        "source_type": "comment",
        "temp_id": "m_t1_lrgipxt_1",
        "dish_attributes": null,
        "dish_categories": [
          "old fashion"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "old-fashioned",
        "dish_primary_category": "old fashion",
        "dish_temp_id": "d_oldfashion_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-10T18:04:14Z",
        "source_upvotes": 12,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
        "source_id": "t1_lrgipxt",
        "source_type": "comment",
        "temp_id": "m_t1_lrgipxt_2",
        "dish_attributes": null,
        "dish_categories": [
          "burger"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger",
        "dish_primary_category": "burger",
        "dish_temp_id": "d_burger_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-10T18:04:14Z",
        "source_upvotes": 12,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
        "source_id": "t1_lrlwx6z",
        "source_type": "comment",
        "temp_id": "m_t1_lrlwx6z_1",
        "dish_attributes": [
          "high-quality"
        ],
        "dish_categories": [
          "old fashion"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "old fashioned",
        "dish_primary_category": "old fashion",
        "dish_temp_id": "d_oldfashion_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T19:08:13Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
        "source_id": "t1_lrlwx6z",
        "source_type": "comment",
        "temp_id": "m_t1_lrlwx6z_2",
        "dish_attributes": [
          "filling",
          "high quality"
        ],
        "dish_categories": [
          "burger"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger",
        "dish_primary_category": "burger",
        "dish_temp_id": "d_burger_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T19:08:13Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
        "source_id": "t1_lrlwx6z",
        "source_type": "comment",
        "temp_id": "m_t1_lrlwx6z_3",
        "dish_attributes": null,
        "dish_categories": [
          "fries"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "fries",
        "dish_primary_category": "fries",
        "dish_temp_id": "d_fries_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T19:08:13Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_1",
        "dish_attributes": null,
        "dish_categories": [
          "oysters"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "oysters",
        "dish_primary_category": "oysters",
        "dish_temp_id": "d_oysters_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_2",
        "dish_attributes": null,
        "dish_categories": [
          "shrimp cocktail",
          "shrimp",
          "cocktail"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "shrimp cocktails",
        "dish_primary_category": "shrimp cocktail",
        "dish_temp_id": "d_shrimpcocktail_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_3",
        "dish_attributes": null,
        "dish_categories": [
          "mussels"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "mussels",
        "dish_primary_category": "mussels",
        "dish_temp_id": "d_mussels_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_4",
        "dish_attributes": null,
        "dish_categories": [
          "fries"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "fries",
        "dish_primary_category": "fries",
        "dish_temp_id": "d_fries_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_5",
        "dish_attributes": null,
        "dish_categories": [
          "caesar salad",
          "salad"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Caesar salad",
        "dish_primary_category": "caesar salad",
        "dish_temp_id": "d_caesarsalad_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_6",
        "dish_attributes": null,
        "dish_categories": [
          "cocktail"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "cocktails",
        "dish_primary_category": "cocktail",
        "dish_temp_id": "d_cocktail_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
        "source_id": "t1_lrij949",
        "source_type": "comment",
        "temp_id": "m_t1_lrij949_7",
        "dish_attributes": null,
        "dish_categories": [
          "wine"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "wine",
        "dish_primary_category": "wine",
        "dish_temp_id": "d_wine_1",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-11T01:55:03Z",
        "source_upvotes": 7,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_hillsidefarmacy_1",
        "source_content": "They also do a steak night on Sundays! Love Hillside.",
        "source_id": "t1_lrt967k",
        "source_type": "comment",
        "temp_id": "m_t1_lrt967k_1",
        "dish_attributes": null,
        "dish_categories": [
          "steak"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak night",
        "dish_primary_category": "steak",
        "dish_temp_id": "d_steak_1",
        "restaurant_attributes": [
          "steak night",
          "sunday"
        ],
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": "Hillside",
        "source_created_at": "2024-10-12T00:06:49Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_1",
        "dish_attributes": [
          "house roasted",
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_polazios_1",
        "source_content": "Polazios 1st Friday’s $10 prime rib.",
        "source_id": "t1_lrfryrh",
        "source_type": "comment",
        "temp_id": "m_2",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "polazios",
        "restaurant_original_text": "Polazios",
        "source_created_at": "2028-10-10T15:38:08Z",
        "source_upvotes": 20,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_polazios_1",
        "source_content": "Prime rib with a view😎",
        "source_id": "t1_lrgmzdw",
        "source_type": "comment",
        "temp_id": "m_3",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_2",
        "restaurant_attributes": [
          "view"
        ],
        "restaurant_normalized_name": "polazios",
        "restaurant_original_text": null,
        "source_created_at": "2028-10-10T18:41:40Z",
        "source_upvotes": 11,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_house_roasted_beef_rib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
        "source_content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
        "source_id": "t1_lrfsm6j",
        "source_type": "comment",
        "temp_id": "mention_t1_lrfsm6j_1",
        "dish_attributes": [
          "smoked",
          "sliced",
          "special",
          "lunch"
        ],
        "dish_categories": [
          "new york strip",
          "strip",
          "steak",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Smoked Strip Friday Lunch",
        "dish_primary_category": "new york strip",
        "dish_temp_id": "dish_smoked_strip_friday_lunch_t1_lrfsm6j",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "CARVE®",
        "source_created_at": "2024-10-10T15:41:37Z",
        "source_upvotes": 20,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
        "source_content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
        "source_id": "t1_lrfsm6j",
        "source_type": "comment",
        "temp_id": "mention_t1_lrfsm6j_2",
        "dish_attributes": [
          "mashed"
        ],
        "dish_categories": [
          "mashed potatoes",
          "potatoes",
          "vegetable"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "mashed potatoes",
        "dish_primary_category": "mashed potatoes",
        "dish_temp_id": "dish_mashed_potatoes_t1_lrfsm6j",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "CARVE®",
        "source_created_at": "2024-10-10T15:41:37Z",
        "source_upvotes": 20,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
        "source_content": "This has been my go to Friday lunch for a while. IMO it’s the best steak special in town.",
        "source_id": "t1_lrfzqe7",
        "source_type": "comment",
        "temp_id": "mention_t1_lrfzqe7_1",
        "dish_attributes": [
          "special",
          "lunch"
        ],
        "dish_categories": [
          "steak",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak special",
        "dish_primary_category": "steak",
        "dish_temp_id": "dish_smoked_strip_friday_lunch_t1_lrfsm6j",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "Carve",
        "source_created_at": "2024-10-10T16:00:05Z",
        "source_upvotes": 1,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
        "source_content": "And quite possibly the finest cut of meat for the price I've ever encountered.",
        "source_id": "t1_lrg090q",
        "source_type": "comment",
        "temp_id": "mention_t1_lrg090q_1",
        "dish_attributes": [
          "finest"
        ],
        "dish_categories": [
          "meat",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "finest cut of meat",
        "dish_primary_category": "meat",
        "dish_temp_id": "dish_smoked_strip_friday_lunch_t1_lrfsm6j",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "Carve",
        "source_created_at": "2024-10-10T16:02:51Z",
        "source_upvotes": 2,
        "source_url": null
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_maie_day",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "10 oz",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_prime_rib_special",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03+00:00",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03+00:00",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T07:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "R_MaieDays_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "M_PrimeRibSpecial_t3_1g1dspf",
        "dish_attributes": [
          "special",
          "house roasted",
          "10 oz"
        ],
        "dish_categories": [
          "prime rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "D_PrimeRib_t3_1g1dspf",
        "restaurant_attributes": [
          "daily specials"
        ],
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "R_MaieDays_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "M_Sides_t3_1g1dspf",
        "dish_attributes": [
          "terrific"
        ],
        "dish_categories": [
          "side dish"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side dish",
        "dish_temp_id": "D_SideDish_t3_1g1dspf",
        "restaurant_attributes": [
          "daily specials"
        ],
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "special",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "beef rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_t3_1g1dspf_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
        "source_content": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
        "source_id": "t1_lrg1ccu",
        "source_type": "comment",
        "temp_id": "mention_t1_lrg1ccu_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_t3_1g1dspf_1",
        "restaurant_attributes": [
          "great value"
        ],
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T16:08:44Z",
        "source_upvotes": 6,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
        "source_content": "Perry's has been around a lot longer than Maie Day. Makes sense that their special is more popular/well-known. $35 for a beautifully-cooked 10-oz prime rib with two sides is a good deal. You can't get anything comparable in that area at that quality for that price. Being negative for the sake of being negative isn't the flex that you seem to think it is.",
        "source_id": "t1_lrh1fba",
        "source_type": "comment",
        "temp_id": "mention_t1_lrh1fba_1",
        "dish_attributes": [
          "beautifully-cooked"
        ],
        "dish_categories": [
          "prime rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_t3_1g1dspf_1",
        "restaurant_attributes": [
          "great value",
          "high quality"
        ],
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T19:49:44Z",
        "source_upvotes": -2,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
        "source_content": "Yup. The prime rib is cooked really well and they have the process dial down. I would recommend it to anyone who likes prime rib. The service is also really good.",
        "source_id": "t1_lrjy99y",
        "source_type": "comment",
        "temp_id": "mention_t1_lrjy99y_1",
        "dish_attributes": [
          "cooked really well"
        ],
        "dish_categories": [
          "prime rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_t3_1g1dspf_1",
        "restaurant_attributes": [
          "great service"
        ],
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-11T10:44:00Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": [
          "prime"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_2",
        "source_content": "Best bang for your buck has to be Schlotzsky’s buy one get one free pizza on Wednesdays. Basically $5 per pizza. Cheaper than dominos",
        "source_id": "t1_lrhpj8u",
        "source_type": "comment",
        "temp_id": "mention_3",
        "dish_attributes": null,
        "dish_categories": [
          "pizza"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pizza",
        "dish_primary_category": "pizza",
        "dish_temp_id": "dish_3",
        "restaurant_attributes": [
          "budget-friendly"
        ],
        "restaurant_normalized_name": "schlotzsky's",
        "restaurant_original_text": "Schlotzsky’s",
        "source_created_at": "2028-10-10T22:23:25Z",
        "source_upvotes": 5,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_2",
        "source_content": "Yeah any location on Wednesday’s. Also $5 pizzas after 5pm Friday Saturday Sunday with is the same thing but I’m not sure how long that offer is good for. The Wednesday one is forever. Hmm I like it 🤔",
        "source_id": "t1_lri14zz",
        "source_type": "comment",
        "temp_id": "mention_4",
        "dish_attributes": null,
        "dish_categories": [
          "pizza"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pizzas",
        "dish_primary_category": "pizza",
        "dish_temp_id": "dish_3",
        "restaurant_attributes": [
          "budget-friendly"
        ],
        "restaurant_normalized_name": "schlotzsky's",
        "restaurant_original_text": null,
        "source_created_at": "2028-10-10T23:03:16Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_t3_1g1dspf_0",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_0",
        "dish_attributes": [
          "prime",
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "10 oz house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_t3_1g1dspf_0",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_beef_rib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
        "source_content": "Ah yeah, that's what I meant. I had a Monte Cristo there before...was pretty good. For my mouth, that is, not my arteries.",
        "source_id": "t1_lrg7gmc",
        "source_type": "comment",
        "temp_id": "mention_t1_lrg7gmc_1",
        "dish_attributes": null,
        "dish_categories": [
          "monte cristo",
          "sandwich"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Monte Cristo",
        "dish_primary_category": "monte cristo",
        "dish_temp_id": "dish_monte_cristo_t1_lrg7gmc",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-10T17:01:58Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_prime_rib_special_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_beef_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_maie_day_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_maie_day_prime_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2028-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_yellow_rose_1",
        "source_content": "Yellow Rose prime rib",
        "source_id": "t1_lrggeej",
        "source_type": "comment",
        "temp_id": "m_yellow_rose_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_yellow_rose_prime_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "yellow rose",
        "restaurant_original_text": "Yellow Rose",
        "source_created_at": "2028-10-10T17:51:13Z",
        "source_upvotes": 4,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "10 oz",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "rest_t3_1g1dspf_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "prime",
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_t3_1g1dspf_1",
        "restaurant_attributes": [
          "special"
        ],
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "special",
          "house roasted",
          "terrific"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_eberly_cedar_tavern_t1_lrhug9y",
        "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
        "source_id": "t1_lrhug9y",
        "source_type": "comment",
        "temp_id": "mention_t1_lrhug9y_1",
        "dish_attributes": null,
        "dish_categories": [
          "martini",
          "cocktail",
          "drink"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "martini",
        "dish_primary_category": "martini",
        "dish_temp_id": "dish_martini_t1_lrhug9y",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "eberly/cedar tavern",
        "restaurant_original_text": "Eberly/Cedar Tavern",
        "source_created_at": "2024-10-10T22:57:11Z",
        "source_upvotes": 3,
        "source_url": null
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_eberly_cedar_tavern_t1_lrhug9y",
        "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
        "source_id": "t1_lrhug9y",
        "source_type": "comment",
        "temp_id": "mention_t1_lrhug9y_2",
        "dish_attributes": null,
        "dish_categories": [
          "burger",
          "sandwich"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger",
        "dish_primary_category": "burger",
        "dish_temp_id": "dish_burger_t1_lrhug9y",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "eberly/cedar tavern",
        "restaurant_original_text": "Eberly/Cedar Tavern",
        "source_created_at": "2024-10-10T22:57:11Z",
        "source_upvotes": 3,
        "source_url": null
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_eberly_cedar_tavern_t1_lrhug9y",
        "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
        "source_id": "t1_lrhug9y",
        "source_type": "comment",
        "temp_id": "mention_t1_lrhug9y_3",
        "dish_attributes": [
          "parmesan"
        ],
        "dish_categories": [
          "fries",
          "potato"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Parmesan fries",
        "dish_primary_category": "fries",
        "dish_temp_id": "dish_parmesan_fries_t1_lrhug9y",
        "restaurant_attributes": [
          "happy hour"
        ],
        "restaurant_normalized_name": "eberly/cedar tavern",
        "restaurant_original_text": "Eberly/Cedar Tavern",
        "source_created_at": "2024-10-10T22:57:11Z",
        "source_upvotes": 3,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_1",
        "restaurant_attributes": [
          "special"
        ],
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_perrys_1",
        "source_content": "Long time Perry’s pork chop eater, first time poster. I am a HUGE steak person. I will admit, if I’m attending Perry’s on the company dime, I will usually order beef. HOWEVER until I tried the Perry’s pork chop I have never had a moist and tender pork dish. Man oh man did Perry’s prove my assumptions wrong. Their Friday special is not only a great deal but also delicious.",
        "source_id": "t1_lrirdbo",
        "source_type": "comment",
        "temp_id": "mention_t1_lrirdbo_1",
        "dish_attributes": [
          "moist",
          "tender"
        ],
        "dish_categories": [
          "pork chop",
          "pork",
          "chop"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Perry’s pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_pork_chop_1",
        "restaurant_attributes": [
          "friday special",
          "great deal"
        ],
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry’s",
        "source_created_at": "2024-10-11T03:03:10Z",
        "source_upvotes": 3,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_prime_rib",
        "dish_attributes": [
          "special",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_sides",
        "dish_attributes": null,
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side",
        "dish_temp_id": "dish_sides_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r_maieday_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_maieday_t3_1g1dspf_primerib",
        "dish_attributes": [
          "10 oz",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_primerib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_costco_t1_lrlahsu",
        "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
        "source_id": "t1_lrlahsu",
        "source_type": "comment",
        "temp_id": "m_costco_t1_lrlahsu_hotdog",
        "dish_attributes": [
          "100% beef"
        ],
        "dish_categories": [
          "hot dog",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "hot dog deal",
        "dish_primary_category": "hot dog",
        "dish_temp_id": "d_hotdog_t1_lrlahsu",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "costco",
        "restaurant_original_text": "Costco",
        "source_created_at": "2024-10-11T15:45:13Z",
        "source_upvotes": 2,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_costco_t1_lrlahsu",
        "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
        "source_id": "t1_lrlahsu",
        "source_type": "comment",
        "temp_id": "m_costco_t1_lrlahsu_arrachera",
        "dish_attributes": [
          "grilled"
        ],
        "dish_categories": [
          "arrachera",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Arrachera package",
        "dish_primary_category": "arrachera",
        "dish_temp_id": "d_arrachera_t1_lrlahsu",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "costco",
        "restaurant_original_text": "Costco",
        "source_created_at": "2024-10-11T15:45:13Z",
        "source_upvotes": 2,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_costco_t1_lrlahsu",
        "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
        "source_id": "t1_lrlahsu",
        "source_type": "comment",
        "temp_id": "m_costco_t1_lrlahsu_beef",
        "dish_attributes": [
          "grilled"
        ],
        "dish_categories": [
          "beef"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "piece of beef",
        "dish_primary_category": "beef",
        "dish_temp_id": "d_beef_t1_lrlahsu",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "costco",
        "restaurant_original_text": "Costco",
        "source_created_at": "2024-10-11T15:45:13Z",
        "source_upvotes": 2,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_2",
        "dish_attributes": [
          "house roasted",
          "10 oz"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_days_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_1",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_days_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "d_house_roasted_beef_rib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maiedays",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_0",
        "dish_attributes": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_maiedays_primerib",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maiedays",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "d_maiedays_primerib",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maiedays",
        "source_content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
        "source_id": "t1_lrfu1bn",
        "source_type": "comment",
        "temp_id": "m_t1_lrfu1bn_0",
        "dish_attributes": [
          "maldon salt"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Prime Rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_maiedays_primerib",
        "restaurant_attributes": [
          "music"
        ],
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-10T15:49:21Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maiedays",
        "source_content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
        "source_id": "t1_lrfu1bn",
        "source_type": "comment",
        "temp_id": "m_t1_lrfu1bn_1",
        "dish_attributes": null,
        "dish_categories": [
          "biscuit"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "biscuits",
        "dish_primary_category": "biscuit",
        "dish_temp_id": "d_biscuit",
        "restaurant_attributes": [
          "music"
        ],
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-10T15:49:21Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m1",
        "dish_attributes": [
          "special",
          "house roasted",
          "10 oz",
          "terrific"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "r2",
        "source_content": "Josephine House’s steak night on Monday’s is fantastic",
        "source_id": "t1_lrfvdnj",
        "source_type": "comment",
        "temp_id": "m2",
        "dish_attributes": [
          "night",
          "fantastic"
        ],
        "dish_categories": [
          "steak"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak night",
        "dish_primary_category": "steak",
        "dish_temp_id": "d2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "josephine house",
        "restaurant_original_text": "Josephine House’s",
        "source_created_at": "2024-10-10T15:56:35Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T07:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Yum 😋",
        "source_id": "t1_lrhvymt",
        "source_type": "comment",
        "temp_id": "mention_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-10T15:34:14Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": [
          "house roasted",
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef",
          "beef rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": [
          "daily specials"
        ],
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": [
          "daily specials"
        ],
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": [
          "prime",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted",
          "10 oz"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": [
          "daily special"
        ],
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_2",
        "dish_attributes": null,
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side",
        "dish_temp_id": "d_side_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_days_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_post_1",
        "dish_attributes": [
          "house roasted",
          "prime"
        ],
        "dish_categories": [
          "beef rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_beef_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_eurasia_1",
        "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
        "source_id": "t1_lrol3qk",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_1",
        "dish_attributes": null,
        "dish_categories": [
          "sushi roll",
          "sushi",
          "roll"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "sushi rolls",
        "dish_primary_category": "sushi roll",
        "dish_temp_id": "dish_sushi_roll_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "eurasia",
        "restaurant_original_text": "Eurasia",
        "source_created_at": "2024-10-12T05:07:01Z",
        "source_upvotes": 1,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_eurasia_1",
        "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
        "source_id": "t1_lrol3qk",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_2",
        "dish_attributes": [
          "miso"
        ],
        "dish_categories": [
          "miso soup",
          "soup"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "miso soup",
        "dish_primary_category": "miso soup",
        "dish_temp_id": "dish_miso_soup_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "eurasia",
        "restaurant_original_text": "Eurasia",
        "source_created_at": "2024-10-12T05:07:01Z",
        "source_upvotes": 1,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_eurasia_1",
        "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
        "source_id": "t1_lrol3qk",
        "source_type": "comment",
        "temp_id": "mention_comment_1_dish_3",
        "dish_attributes": null,
        "dish_categories": [
          "salad"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "salad",
        "dish_primary_category": "salad",
        "dish_temp_id": "dish_salad_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "eurasia",
        "restaurant_original_text": "Eurasia",
        "source_created_at": "2024-10-12T05:07:01Z",
        "source_upvotes": 1,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_days_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_1",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef",
          "meat"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "d_prime_rib_special_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03+00:00",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_days_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef",
          "meat"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "d_beef_rib_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03+00:00",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "rest_maiedays_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "beef rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_beefrib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "rest_maiedays_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_primerib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "rest_maiedays_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_2",
        "dish_attributes": [
          "house roasted",
          "10 oz"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "10 oz house roasted beef rib",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_beefrib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "rest_torchys_t1_lriz3q0",
        "source_content": "Anything at Torchys",
        "source_id": "t1_lriz3q0",
        "source_type": "comment",
        "temp_id": "mention_t1_lriz3q0_1",
        "dish_attributes": null,
        "dish_categories": null,
        "dish_is_menu_item": null,
        "dish_original_text": null,
        "dish_primary_category": null,
        "dish_temp_id": null,
        "restaurant_attributes": null,
        "restaurant_normalized_name": "torchys",
        "restaurant_original_text": "Torchys",
        "source_created_at": "2024-10-10T23:36:43Z",
        "source_upvotes": -2,
        "source_url": null
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_prime_rib_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_t3_1g1dspf_2",
        "dish_attributes": [
          "terrific"
        ],
        "dish_categories": [
          "side"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "sides",
        "dish_primary_category": "side",
        "dish_temp_id": "dish_side_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
        "source_content": "it looks like someone made a diaper out of a steak but I would still eat the shit out of that. It looks amazing",
        "source_id": "t1_lrg2f0v",
        "source_type": "comment",
        "temp_id": "mention_t1_lrg2f0v_1",
        "dish_attributes": [
          "amazing"
        ],
        "dish_categories": [
          "steak",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak",
        "dish_primary_category": "steak",
        "dish_temp_id": "dish_steak_t1_lrg2f0v",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": null,
        "source_created_at": "2024-10-10T16:34:25Z",
        "source_upvotes": -3,
        "source_url": null
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "m_t3_1g1dspf_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
        "source_content": "Maie Day bitches",
        "source_id": "t1_lri6vt6",
        "source_type": "comment",
        "temp_id": "m_t1_lri6vt6_1",
        "dish_attributes": [
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": null,
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "source_created_at": "2024-10-11T00:44:28Z",
        "source_upvotes": -3,
        "source_url": null
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "R1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "M1",
        "dish_attributes": [
          "special",
          "house roasted",
          "10 oz"
        ],
        "dish_categories": [
          "prime rib",
          "beef",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "D1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie days",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "R1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "M1",
        "dish_attributes": [
          "special",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "D1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": true,
        "restaurant_temp_id": "restaurant_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "temp_id": "mention_1",
        "dish_attributes": [
          "house roasted",
          "special"
        ],
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "source_created_at": "2024-10-10T15:05:03Z",
        "source_upvotes": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_2",
        "source_content": "Yes. I’m a ribeye steak guy and I’m not a pork chop guy. Except for Perry’s. I’ll take a Perry’s pork chop over almost any cut of beef",
        "source_id": "t1_lrgogtu",
        "source_type": "comment",
        "temp_id": "mention_2",
        "dish_attributes": null,
        "dish_categories": [
          "pork chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry’s",
        "source_created_at": "2024-10-10T18:36:30Z",
        "source_upvotes": 16,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_2",
        "source_content": "Exactly. Perry's pork chop is better than 90% of the steaks I've had in my life.",
        "source_id": "t1_lrkwu2b",
        "source_type": "comment",
        "temp_id": "mention_3",
        "dish_attributes": null,
        "dish_categories": [
          "pork chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry's",
        "source_created_at": "2024-10-11T14:28:12Z",
        "source_upvotes": 1,
        "source_url": ""
      },
      {
        "general_praise": false,
        "restaurant_temp_id": "restaurant_2",
        "source_content": "I have had some dry ones on occasion as well. Unfortunately, the overall quality and experience at Perry's has declined even as the price has gone up. But it is still a pretty great lunch special.",
        "source_id": "t1_lrfy6qi",
        "source_type": "comment",
        "temp_id": "mention_4",
        "dish_attributes": [
          "lunch"
        ],
        "dish_categories": [
          "lunch special",
          "special"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "lunch special",
        "dish_primary_category": "lunch special",
        "dish_temp_id": "dish_3",
        "restaurant_attributes": null,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry's",
        "source_created_at": "2024-10-10T16:51:40Z",
        "source_upvotes": 12,
        "source_url": ""
      }
    ]
  },
  "flatSchemaOutput": [
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_1",
          "dish_attributes": [
            "special",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_special",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T19:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "d_house_roasted_beef_rib",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T19:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
          "source_id": "t1_lrfuod7",
          "source_type": "comment",
          "temp_id": "m_3",
          "dish_attributes": [
            "cheap",
            "budget-friendly"
          ],
          "dish_categories": [
            "early dine menu",
            "menu"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Early Dine menu",
          "dish_primary_category": "early dine menu",
          "dish_temp_id": "d_early_dine_menu",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-10T19:52:47Z",
          "source_upvotes": 83,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
          "source_id": "t1_lrfuod7",
          "source_type": "comment",
          "temp_id": "m_4",
          "dish_attributes": null,
          "dish_categories": [
            "entree"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "entrees",
          "dish_primary_category": "entree",
          "dish_temp_id": "d_entree",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-10T19:52:47Z",
          "source_upvotes": 83,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
          "source_id": "t1_lrfuod7",
          "source_type": "comment",
          "temp_id": "m_5",
          "dish_attributes": [
            "cheap"
          ],
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "Sides",
          "dish_primary_category": "side",
          "dish_temp_id": "d_side",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-10T19:52:47Z",
          "source_upvotes": 83,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
          "source_id": "t1_lrg46x1",
          "source_type": "comment",
          "temp_id": "m_6",
          "dish_attributes": null,
          "dish_categories": [
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "18oz rib",
          "dish_primary_category": "rib",
          "dish_temp_id": "d_rib",
          "restaurant_attributes": [
            "consistent"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "roadhouse",
          "source_created_at": "2028-10-10T20:54:03Z",
          "source_upvotes": 32,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
          "source_id": "t1_lrg46x1",
          "source_type": "comment",
          "temp_id": "m_7",
          "dish_attributes": null,
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side",
          "dish_temp_id": "d_side_2",
          "restaurant_attributes": [
            "consistent"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "roadhouse",
          "source_created_at": "2028-10-10T20:54:03Z",
          "source_upvotes": 32,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
          "source_id": "t1_lrg62bj",
          "source_type": "comment",
          "temp_id": "m_8",
          "dish_attributes": null,
          "dish_categories": null,
          "dish_is_menu_item": null,
          "dish_original_text": null,
          "dish_primary_category": null,
          "dish_temp_id": null,
          "restaurant_attributes": null,
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": null,
          "source_created_at": "2028-10-10T21:07:34Z",
          "source_upvotes": 9,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "Yep, they’re pretty consistent, and busy as hell.  I really don’t think I’ve ever been there when it’s not packed all times of the day.  Just reminds me of all the fairly priced places from the 90’s that didn’t knock your socks off or did anything mind blowing but they were always consistent and had good food",
          "source_id": "t1_lrg7x0s",
          "source_type": "comment",
          "temp_id": "m_9",
          "dish_attributes": null,
          "dish_categories": null,
          "dish_is_menu_item": null,
          "dish_original_text": null,
          "dish_primary_category": null,
          "dish_temp_id": null,
          "restaurant_attributes": [
            "consistent",
            "busy",
            "packed",
            "fairly priced",
            "good food"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": null,
          "source_created_at": "2028-10-10T21:17:46Z",
          "source_upvotes": 14,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "100%. It feels nostalgic, which post-Covid is a welcomed feeling! It's the go-to in the budget category for us.\n\nYou're making me want to buy some shares, too!",
          "source_id": "t1_lrjh8q0",
          "source_type": "comment",
          "temp_id": "m_10",
          "dish_attributes": null,
          "dish_categories": null,
          "dish_is_menu_item": null,
          "dish_original_text": null,
          "dish_primary_category": null,
          "dish_temp_id": null,
          "restaurant_attributes": [
            "nostalgic",
            "budget-friendly"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": null,
          "source_created_at": "2028-10-11T12:44:21Z",
          "source_upvotes": 3,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I went bc i was on a road trip. It's pretty middling quality. Rolls are great.",
          "source_id": "t1_lrg81yv",
          "source_type": "comment",
          "temp_id": "m_11",
          "dish_attributes": [
            "great"
          ],
          "dish_categories": [
            "roll"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Rolls",
          "dish_primary_category": "roll",
          "dish_temp_id": "d_roll",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": null,
          "source_created_at": "2028-10-10T21:18:31Z",
          "source_upvotes": 2,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
          "source_id": "t1_lrjh0n4",
          "source_type": "comment",
          "temp_id": "m_12",
          "dish_attributes": null,
          "dish_categories": [
            "steak",
            "beef"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "steak",
          "dish_primary_category": "steak",
          "dish_temp_id": "d_steak",
          "restaurant_attributes": [
            "great value",
            "fun time",
            "great service"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-11T12:41:38Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
          "source_id": "t1_lrjh0n4",
          "source_type": "comment",
          "temp_id": "m_13",
          "dish_attributes": [
            "great marbling"
          ],
          "dish_categories": [
            "ribeye",
            "steak",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "ribeye",
          "dish_primary_category": "ribeye",
          "dish_temp_id": "d_ribeye",
          "restaurant_attributes": [
            "great value",
            "fun time",
            "great service"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-11T12:41:38Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
          "source_id": "t1_lrjh0n4",
          "source_type": "comment",
          "temp_id": "m_14",
          "dish_attributes": [
            "decent"
          ],
          "dish_categories": [
            "drink"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "drinks",
          "dish_primary_category": "drink",
          "dish_temp_id": "d_drink",
          "restaurant_attributes": [
            "great value",
            "fun time",
            "great service"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-11T12:41:38Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
          "source_id": "t1_lrjh0n4",
          "source_type": "comment",
          "temp_id": "m_15",
          "dish_attributes": null,
          "dish_categories": [
            "margarita",
            "drink"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "margs",
          "dish_primary_category": "margarita",
          "dish_temp_id": "d_margarita",
          "restaurant_attributes": [
            "great value",
            "fun time",
            "great service"
          ],
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Texas Roadhouse",
          "source_created_at": "2028-10-11T12:41:38Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
          "source_id": "t1_lrgm3rj",
          "source_type": "comment",
          "temp_id": "m_16",
          "dish_attributes": null,
          "dish_categories": [
            "roll"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "rolls",
          "dish_primary_category": "roll",
          "dish_temp_id": "d_roll_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Roadhouse",
          "source_created_at": "2028-10-10T21:43:26Z",
          "source_upvotes": 8,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_texas_roadhouse",
          "source_content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
          "source_id": "t1_lrgm3rj",
          "source_type": "comment",
          "temp_id": "m_17",
          "dish_attributes": [
            "with marshmallows"
          ],
          "dish_categories": [
            "sweet potato",
            "potato",
            "vegetable"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "sweet potato with marshmallows",
          "dish_primary_category": "sweet potato",
          "dish_temp_id": "d_sweet_potato_with_marshmallows",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "texas roadhouse",
          "restaurant_original_text": "Roadhouse",
          "source_created_at": "2028-10-10T21:43:26Z",
          "source_upvotes": 8,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "rest_maieday_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_post_1",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_primerib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "rest_maieday_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_post_2",
          "dish_attributes": [
            "house roasted",
            "roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_beefrib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "rest_jackallens_1",
          "source_content": "Jack Allen’s happy hour is half off apps. You can get literally every app, like 8 different ones, for like $50. It’s a ton of food and a great deal.",
          "source_id": "t1_lrg1s92",
          "source_type": "comment",
          "temp_id": "mention_comment_1",
          "dish_attributes": null,
          "dish_categories": [
            "appetizer"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "apps",
          "dish_primary_category": "appetizer",
          "dish_temp_id": "dish_appetizer_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "jack allen's",
          "restaurant_original_text": "Jack Allen’s",
          "source_created_at": "2024-10-10T16:31:04Z",
          "source_upvotes": 31,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_post_1",
          "dish_attributes": [
            "roasted",
            "house-made"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_lonesome_dove_1",
          "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
          "source_id": "t1_lrfthzm",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_2",
          "restaurant_attributes": [
            "lunch"
          ],
          "restaurant_normalized_name": "lonesome dove",
          "restaurant_original_text": "Lonesome Dove's",
          "source_created_at": "2024-10-10T15:46:26Z",
          "source_upvotes": 26,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_lonesome_dove_1",
          "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
          "source_id": "t1_lrfthzm",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_2",
          "dish_attributes": [
            "twice-baked"
          ],
          "dish_categories": [
            "potato"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "twice-baked potato",
          "dish_primary_category": "potato",
          "dish_temp_id": "dish_potato_1",
          "restaurant_attributes": [
            "lunch"
          ],
          "restaurant_normalized_name": "lonesome dove",
          "restaurant_original_text": "Lonesome Dove's",
          "source_created_at": "2024-10-10T15:46:26Z",
          "source_upvotes": 26,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_lonesome_dove_1",
          "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
          "source_id": "t1_lrfthzm",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_3",
          "dish_attributes": null,
          "dish_categories": [
            "burger"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "burger",
          "dish_primary_category": "burger",
          "dish_temp_id": "dish_burger_1",
          "restaurant_attributes": [
            "lunch"
          ],
          "restaurant_normalized_name": "lonesome dove",
          "restaurant_original_text": "Lonesome Dove's",
          "source_created_at": "2024-10-10T15:46:26Z",
          "source_upvotes": 26,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_lonesome_dove_1",
          "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
          "source_id": "t1_lrfthzm",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_4",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib sandwich",
            "sandwich",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib sandwich",
          "dish_primary_category": "prime rib sandwich",
          "dish_temp_id": "dish_prime_rib_sandwich_1",
          "restaurant_attributes": [
            "lunch"
          ],
          "restaurant_normalized_name": "lonesome dove",
          "restaurant_original_text": "Lonesome Dove's",
          "source_created_at": "2024-10-10T15:46:26Z",
          "source_upvotes": 26,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_t3_1g1dspf_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_t3_1g1dspf_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t1_lrfqypm_1",
          "source_content": "HUGE pork-chop at Perry’s in domain or 7th Street is the best special \nback in my day, price was about $14… now it’s up to $19… Rambles about inflation 😝",
          "source_id": "t1_lrfqypm",
          "source_type": "comment",
          "temp_id": "mention_t1_lrfqypm_1",
          "dish_attributes": [
            "huge"
          ],
          "dish_categories": [
            "pork chop",
            "pork"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "pork-chop",
          "dish_primary_category": "pork chop",
          "dish_temp_id": "dish_t1_lrfqypm_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "perry's",
          "restaurant_original_text": "Perry’s",
          "source_created_at": "2024-10-10T15:32:49Z",
          "source_upvotes": 26,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t1_lrfqypm_1",
          "source_content": "I remember having it when it was $11. If it was never $11, then I don’t know what I remember. I’m old. But even as a person who doesn’t generally like pork, it actually is quite good.",
          "source_id": "t1_lri5neu",
          "source_type": "comment",
          "temp_id": "mention_t1_lri5neu_1",
          "dish_attributes": [
            "quite good"
          ],
          "dish_categories": [
            "pork chop",
            "pork"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "pork chop",
          "dish_primary_category": "pork chop",
          "dish_temp_id": "dish_t1_lrfqypm_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "perry's",
          "restaurant_original_text": "Perry’s",
          "source_created_at": "2024-10-10T23:02:19Z",
          "source_upvotes": 2,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_post_1",
          "dish_attributes": [],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_special_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_post_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "d_beef_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_post_3",
          "dish_attributes": null,
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side",
          "dish_temp_id": "d_sides_post_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_churchs_1",
          "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
          "source_id": "t1_lrgn98r",
          "source_type": "comment",
          "temp_id": "m_comment_1",
          "dish_attributes": [
            "texas"
          ],
          "dish_categories": [
            "texas two piece feast",
            "chicken",
            "feast"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Texas Two Piece Feast",
          "dish_primary_category": "texas two piece feast",
          "dish_temp_id": "d_texas_two_piece_feast_1",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "church's",
          "restaurant_original_text": "Church's",
          "source_created_at": "2028-10-10T18:29:51Z",
          "source_upvotes": 25,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_churchs_1",
          "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
          "source_id": "t1_lrgn98r",
          "source_type": "comment",
          "temp_id": "m_comment_2",
          "dish_attributes": null,
          "dish_categories": [
            "leg",
            "chicken"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Leg",
          "dish_primary_category": "leg",
          "dish_temp_id": "d_leg_1",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "church's",
          "restaurant_original_text": "Church's",
          "source_created_at": "2028-10-10T18:29:51Z",
          "source_upvotes": 25,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_churchs_1",
          "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
          "source_id": "t1_lrgn98r",
          "source_type": "comment",
          "temp_id": "m_comment_3",
          "dish_attributes": null,
          "dish_categories": [
            "thigh",
            "chicken"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "thigh",
          "dish_primary_category": "thigh",
          "dish_temp_id": "d_thigh_1",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "church's",
          "restaurant_original_text": "Church's",
          "source_created_at": "2028-10-10T18:29:51Z",
          "source_upvotes": 25,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_churchs_1",
          "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
          "source_id": "t1_lrgn98r",
          "source_type": "comment",
          "temp_id": "m_comment_4",
          "dish_attributes": null,
          "dish_categories": [
            "biscuit",
            "bread"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "biscuit",
          "dish_primary_category": "biscuit",
          "dish_temp_id": "d_biscuit_1",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "church's",
          "restaurant_original_text": "Church's",
          "source_created_at": "2028-10-10T18:29:51Z",
          "source_upvotes": 25,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_churchs_1",
          "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
          "source_id": "t1_lrgn98r",
          "source_type": "comment",
          "temp_id": "m_comment_5",
          "dish_attributes": null,
          "dish_categories": [
            "jalapeno",
            "pepper"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "jalapeno",
          "dish_primary_category": "jalapeno",
          "dish_temp_id": "d_jalapeno_1",
          "restaurant_attributes": [
            "budget-friendly",
            "great value"
          ],
          "restaurant_normalized_name": "church's",
          "restaurant_original_text": "Church's",
          "source_created_at": "2028-10-10T18:29:51Z",
          "source_upvotes": 25,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_popeyes_1",
          "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
          "source_id": "t1_lrj1e65",
          "source_type": "comment",
          "temp_id": "m_comment_6",
          "dish_attributes": null,
          "dish_categories": [
            "manager's special",
            "chicken",
            "meal"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "manager's special",
          "dish_primary_category": "manager's special",
          "dish_temp_id": "d_managers_special_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "popeye's",
          "restaurant_original_text": "Popeye's",
          "source_created_at": "2028-10-11T04:40:26Z",
          "source_upvotes": 3,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_popeyes_1",
          "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
          "source_id": "t1_lrj1e65",
          "source_type": "comment",
          "temp_id": "m_comment_7",
          "dish_attributes": null,
          "dish_categories": [
            "chicken"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "chicken",
          "dish_primary_category": "chicken",
          "dish_temp_id": "d_chicken_comment2_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "popeye's",
          "restaurant_original_text": "Popeye's",
          "source_created_at": "2028-10-11T04:40:26Z",
          "source_upvotes": 3,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_popeyes_1",
          "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
          "source_id": "t1_lrj1e65",
          "source_type": "comment",
          "temp_id": "m_comment_8",
          "dish_attributes": null,
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side",
          "dish_temp_id": "d_sides_comment2_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "popeye's",
          "restaurant_original_text": "Popeye's",
          "source_created_at": "2028-10-11T04:40:26Z",
          "source_upvotes": 3,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_popeyes_1",
          "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
          "source_id": "t1_lrj1e65",
          "source_type": "comment",
          "temp_id": "m_comment_9",
          "dish_attributes": [
            "fried"
          ],
          "dish_categories": [
            "fried chicken",
            "chicken"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "fried chicken",
          "dish_primary_category": "fried chicken",
          "dish_temp_id": "d_fried_chicken_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "popeye's",
          "restaurant_original_text": "Popeye's",
          "source_created_at": "2028-10-11T04:40:26Z",
          "source_upvotes": 3,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maieday_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_primerib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maieday_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "d_beefrib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
          "source_id": "t1_lrgdaji",
          "source_type": "comment",
          "temp_id": "m_t1_lrgdaji_1",
          "dish_attributes": null,
          "dish_categories": [
            "old fashion"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "old fashion",
          "dish_primary_category": "old fashion",
          "dish_temp_id": "d_oldfashion_1",
          "restaurant_attributes": [
            "casual"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": "hillside farmacy",
          "source_created_at": "2024-10-10T17:33:59Z",
          "source_upvotes": 24,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
          "source_id": "t1_lrgdaji",
          "source_type": "comment",
          "temp_id": "m_t1_lrgdaji_2",
          "dish_attributes": null,
          "dish_categories": [
            "burger"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "burger",
          "dish_primary_category": "burger",
          "dish_temp_id": "d_burger_1",
          "restaurant_attributes": [
            "casual"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": "hillside farmacy",
          "source_created_at": "2024-10-10T17:33:59Z",
          "source_upvotes": 24,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
          "source_id": "t1_lrgdaji",
          "source_type": "comment",
          "temp_id": "m_t1_lrgdaji_3",
          "dish_attributes": null,
          "dish_categories": [
            "fries"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "fries",
          "dish_primary_category": "fries",
          "dish_temp_id": "d_fries_1",
          "restaurant_attributes": [
            "casual"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": "hillside farmacy",
          "source_created_at": "2024-10-10T17:33:59Z",
          "source_upvotes": 24,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
          "source_id": "t1_lrgipxt",
          "source_type": "comment",
          "temp_id": "m_t1_lrgipxt_1",
          "dish_attributes": null,
          "dish_categories": [
            "old fashion"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "old-fashioned",
          "dish_primary_category": "old fashion",
          "dish_temp_id": "d_oldfashion_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-10T18:04:14Z",
          "source_upvotes": 12,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
          "source_id": "t1_lrgipxt",
          "source_type": "comment",
          "temp_id": "m_t1_lrgipxt_2",
          "dish_attributes": null,
          "dish_categories": [
            "burger"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "burger",
          "dish_primary_category": "burger",
          "dish_temp_id": "d_burger_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-10T18:04:14Z",
          "source_upvotes": 12,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
          "source_id": "t1_lrlwx6z",
          "source_type": "comment",
          "temp_id": "m_t1_lrlwx6z_1",
          "dish_attributes": [
            "high-quality"
          ],
          "dish_categories": [
            "old fashion"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "old fashioned",
          "dish_primary_category": "old fashion",
          "dish_temp_id": "d_oldfashion_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T19:08:13Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
          "source_id": "t1_lrlwx6z",
          "source_type": "comment",
          "temp_id": "m_t1_lrlwx6z_2",
          "dish_attributes": [
            "filling",
            "high quality"
          ],
          "dish_categories": [
            "burger"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "burger",
          "dish_primary_category": "burger",
          "dish_temp_id": "d_burger_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T19:08:13Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
          "source_id": "t1_lrlwx6z",
          "source_type": "comment",
          "temp_id": "m_t1_lrlwx6z_3",
          "dish_attributes": null,
          "dish_categories": [
            "fries"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "fries",
          "dish_primary_category": "fries",
          "dish_temp_id": "d_fries_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T19:08:13Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_1",
          "dish_attributes": null,
          "dish_categories": [
            "oysters"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "oysters",
          "dish_primary_category": "oysters",
          "dish_temp_id": "d_oysters_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_2",
          "dish_attributes": null,
          "dish_categories": [
            "shrimp cocktail",
            "shrimp",
            "cocktail"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "shrimp cocktails",
          "dish_primary_category": "shrimp cocktail",
          "dish_temp_id": "d_shrimpcocktail_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_3",
          "dish_attributes": null,
          "dish_categories": [
            "mussels"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "mussels",
          "dish_primary_category": "mussels",
          "dish_temp_id": "d_mussels_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_4",
          "dish_attributes": null,
          "dish_categories": [
            "fries"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "fries",
          "dish_primary_category": "fries",
          "dish_temp_id": "d_fries_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_5",
          "dish_attributes": null,
          "dish_categories": [
            "caesar salad",
            "salad"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Caesar salad",
          "dish_primary_category": "caesar salad",
          "dish_temp_id": "d_caesarsalad_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_6",
          "dish_attributes": null,
          "dish_categories": [
            "cocktail"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "cocktails",
          "dish_primary_category": "cocktail",
          "dish_temp_id": "d_cocktail_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
          "source_id": "t1_lrij949",
          "source_type": "comment",
          "temp_id": "m_t1_lrij949_7",
          "dish_attributes": null,
          "dish_categories": [
            "wine"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "wine",
          "dish_primary_category": "wine",
          "dish_temp_id": "d_wine_1",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-11T01:55:03Z",
          "source_upvotes": 7,
          "source_url": ""
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r_hillsidefarmacy_1",
          "source_content": "They also do a steak night on Sundays! Love Hillside.",
          "source_id": "t1_lrt967k",
          "source_type": "comment",
          "temp_id": "m_t1_lrt967k_1",
          "dish_attributes": null,
          "dish_categories": [
            "steak"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "steak night",
          "dish_primary_category": "steak",
          "dish_temp_id": "d_steak_1",
          "restaurant_attributes": [
            "steak night",
            "sunday"
          ],
          "restaurant_normalized_name": "hillside farmacy",
          "restaurant_original_text": "Hillside",
          "source_created_at": "2024-10-12T00:06:49Z",
          "source_upvotes": 1,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "r_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_1",
          "dish_attributes": [
            "house roasted",
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_polazios_1",
          "source_content": "Polazios 1st Friday’s $10 prime rib.",
          "source_id": "t1_lrfryrh",
          "source_type": "comment",
          "temp_id": "m_2",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "polazios",
          "restaurant_original_text": "Polazios",
          "source_created_at": "2028-10-10T15:38:08Z",
          "source_upvotes": 20,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_polazios_1",
          "source_content": "Prime rib with a view😎",
          "source_id": "t1_lrgmzdw",
          "source_type": "comment",
          "temp_id": "m_3",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_2",
          "restaurant_attributes": [
            "view"
          ],
          "restaurant_normalized_name": "polazios",
          "restaurant_original_text": null,
          "source_created_at": "2028-10-10T18:41:40Z",
          "source_upvotes": 11,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_house_roasted_beef_rib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
          "source_content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
          "source_id": "t1_lrfsm6j",
          "source_type": "comment",
          "temp_id": "mention_t1_lrfsm6j_1",
          "dish_attributes": [
            "smoked",
            "sliced",
            "special",
            "lunch"
          ],
          "dish_categories": [
            "new york strip",
            "strip",
            "steak",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Smoked Strip Friday Lunch",
          "dish_primary_category": "new york strip",
          "dish_temp_id": "dish_smoked_strip_friday_lunch_t1_lrfsm6j",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "carve",
          "restaurant_original_text": "CARVE®",
          "source_created_at": "2024-10-10T15:41:37Z",
          "source_upvotes": 20,
          "source_url": null
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
          "source_content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
          "source_id": "t1_lrfsm6j",
          "source_type": "comment",
          "temp_id": "mention_t1_lrfsm6j_2",
          "dish_attributes": [
            "mashed"
          ],
          "dish_categories": [
            "mashed potatoes",
            "potatoes",
            "vegetable"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "mashed potatoes",
          "dish_primary_category": "mashed potatoes",
          "dish_temp_id": "dish_mashed_potatoes_t1_lrfsm6j",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "carve",
          "restaurant_original_text": "CARVE®",
          "source_created_at": "2024-10-10T15:41:37Z",
          "source_upvotes": 20,
          "source_url": null
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
          "source_content": "This has been my go to Friday lunch for a while. IMO it’s the best steak special in town.",
          "source_id": "t1_lrfzqe7",
          "source_type": "comment",
          "temp_id": "mention_t1_lrfzqe7_1",
          "dish_attributes": [
            "special",
            "lunch"
          ],
          "dish_categories": [
            "steak",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "steak special",
          "dish_primary_category": "steak",
          "dish_temp_id": "dish_smoked_strip_friday_lunch_t1_lrfsm6j",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "carve",
          "restaurant_original_text": "Carve",
          "source_created_at": "2024-10-10T16:00:05Z",
          "source_upvotes": 1,
          "source_url": null
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_carve_t1_lrfsm6j",
          "source_content": "And quite possibly the finest cut of meat for the price I've ever encountered.",
          "source_id": "t1_lrg090q",
          "source_type": "comment",
          "temp_id": "mention_t1_lrg090q_1",
          "dish_attributes": [
            "finest"
          ],
          "dish_categories": [
            "meat",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "finest cut of meat",
          "dish_primary_category": "meat",
          "dish_temp_id": "dish_smoked_strip_friday_lunch_t1_lrfsm6j",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "carve",
          "restaurant_original_text": "Carve",
          "source_created_at": "2024-10-10T16:02:51Z",
          "source_upvotes": 2,
          "source_url": null
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_maie_day",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "10 oz",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_prime_rib_special",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03+00:00",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03+00:00",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T07:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "R_MaieDays_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "M_PrimeRibSpecial_t3_1g1dspf",
          "dish_attributes": [
            "special",
            "house roasted",
            "10 oz"
          ],
          "dish_categories": [
            "prime rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "D_PrimeRib_t3_1g1dspf",
          "restaurant_attributes": [
            "daily specials"
          ],
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "R_MaieDays_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "M_Sides_t3_1g1dspf",
          "dish_attributes": [
            "terrific"
          ],
          "dish_categories": [
            "side dish"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side dish",
          "dish_temp_id": "D_SideDish_t3_1g1dspf",
          "restaurant_attributes": [
            "daily specials"
          ],
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "special",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "beef rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_t3_1g1dspf_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
          "source_content": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
          "source_id": "t1_lrg1ccu",
          "source_type": "comment",
          "temp_id": "mention_t1_lrg1ccu_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_t3_1g1dspf_1",
          "restaurant_attributes": [
            "great value"
          ],
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T16:08:44Z",
          "source_upvotes": 6,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
          "source_content": "Perry's has been around a lot longer than Maie Day. Makes sense that their special is more popular/well-known. $35 for a beautifully-cooked 10-oz prime rib with two sides is a good deal. You can't get anything comparable in that area at that quality for that price. Being negative for the sake of being negative isn't the flex that you seem to think it is.",
          "source_id": "t1_lrh1fba",
          "source_type": "comment",
          "temp_id": "mention_t1_lrh1fba_1",
          "dish_attributes": [
            "beautifully-cooked"
          ],
          "dish_categories": [
            "prime rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_t3_1g1dspf_1",
          "restaurant_attributes": [
            "great value",
            "high quality"
          ],
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T19:49:44Z",
          "source_upvotes": -2,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_1",
          "source_content": "Yup. The prime rib is cooked really well and they have the process dial down. I would recommend it to anyone who likes prime rib. The service is also really good.",
          "source_id": "t1_lrjy99y",
          "source_type": "comment",
          "temp_id": "mention_t1_lrjy99y_1",
          "dish_attributes": [
            "cooked really well"
          ],
          "dish_categories": [
            "prime rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_t3_1g1dspf_1",
          "restaurant_attributes": [
            "great service"
          ],
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-11T10:44:00Z",
          "source_upvotes": 1,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": [
            "prime"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_2",
          "source_content": "Best bang for your buck has to be Schlotzsky’s buy one get one free pizza on Wednesdays. Basically $5 per pizza. Cheaper than dominos",
          "source_id": "t1_lrhpj8u",
          "source_type": "comment",
          "temp_id": "mention_3",
          "dish_attributes": null,
          "dish_categories": [
            "pizza"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "pizza",
          "dish_primary_category": "pizza",
          "dish_temp_id": "dish_3",
          "restaurant_attributes": [
            "budget-friendly"
          ],
          "restaurant_normalized_name": "schlotzsky's",
          "restaurant_original_text": "Schlotzsky’s",
          "source_created_at": "2028-10-10T22:23:25Z",
          "source_upvotes": 5,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_2",
          "source_content": "Yeah any location on Wednesday’s. Also $5 pizzas after 5pm Friday Saturday Sunday with is the same thing but I’m not sure how long that offer is good for. The Wednesday one is forever. Hmm I like it 🤔",
          "source_id": "t1_lri14zz",
          "source_type": "comment",
          "temp_id": "mention_4",
          "dish_attributes": null,
          "dish_categories": [
            "pizza"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "pizzas",
          "dish_primary_category": "pizza",
          "dish_temp_id": "dish_3",
          "restaurant_attributes": [
            "budget-friendly"
          ],
          "restaurant_normalized_name": "schlotzsky's",
          "restaurant_original_text": null,
          "source_created_at": "2028-10-10T23:03:16Z",
          "source_upvotes": 1,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_t3_1g1dspf_0",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_0",
          "dish_attributes": [
            "prime",
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "10 oz house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_t3_1g1dspf_0",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_beef_rib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_t3_1g1dspf",
          "source_content": "Ah yeah, that's what I meant. I had a Monte Cristo there before...was pretty good. For my mouth, that is, not my arteries.",
          "source_id": "t1_lrg7gmc",
          "source_type": "comment",
          "temp_id": "mention_t1_lrg7gmc_1",
          "dish_attributes": null,
          "dish_categories": [
            "monte cristo",
            "sandwich"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Monte Cristo",
          "dish_primary_category": "monte cristo",
          "dish_temp_id": "dish_monte_cristo_t1_lrg7gmc",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-10T17:01:58Z",
          "source_upvotes": 3,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_prime_rib_special_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_beef_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_maie_day_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_maie_day_prime_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2028-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_yellow_rose_1",
          "source_content": "Yellow Rose prime rib",
          "source_id": "t1_lrggeej",
          "source_type": "comment",
          "temp_id": "m_yellow_rose_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_yellow_rose_prime_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "yellow rose",
          "restaurant_original_text": "Yellow Rose",
          "source_created_at": "2028-10-10T17:51:13Z",
          "source_upvotes": 4,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "10 oz",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "rest_t3_1g1dspf_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "prime",
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_t3_1g1dspf_1",
          "restaurant_attributes": [
            "special"
          ],
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "special",
            "house roasted",
            "terrific"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_eberly_cedar_tavern_t1_lrhug9y",
          "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
          "source_id": "t1_lrhug9y",
          "source_type": "comment",
          "temp_id": "mention_t1_lrhug9y_1",
          "dish_attributes": null,
          "dish_categories": [
            "martini",
            "cocktail",
            "drink"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "martini",
          "dish_primary_category": "martini",
          "dish_temp_id": "dish_martini_t1_lrhug9y",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "eberly/cedar tavern",
          "restaurant_original_text": "Eberly/Cedar Tavern",
          "source_created_at": "2024-10-10T22:57:11Z",
          "source_upvotes": 3,
          "source_url": null
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_eberly_cedar_tavern_t1_lrhug9y",
          "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
          "source_id": "t1_lrhug9y",
          "source_type": "comment",
          "temp_id": "mention_t1_lrhug9y_2",
          "dish_attributes": null,
          "dish_categories": [
            "burger",
            "sandwich"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "burger",
          "dish_primary_category": "burger",
          "dish_temp_id": "dish_burger_t1_lrhug9y",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "eberly/cedar tavern",
          "restaurant_original_text": "Eberly/Cedar Tavern",
          "source_created_at": "2024-10-10T22:57:11Z",
          "source_upvotes": 3,
          "source_url": null
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_eberly_cedar_tavern_t1_lrhug9y",
          "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
          "source_id": "t1_lrhug9y",
          "source_type": "comment",
          "temp_id": "mention_t1_lrhug9y_3",
          "dish_attributes": [
            "parmesan"
          ],
          "dish_categories": [
            "fries",
            "potato"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Parmesan fries",
          "dish_primary_category": "fries",
          "dish_temp_id": "dish_parmesan_fries_t1_lrhug9y",
          "restaurant_attributes": [
            "happy hour"
          ],
          "restaurant_normalized_name": "eberly/cedar tavern",
          "restaurant_original_text": "Eberly/Cedar Tavern",
          "source_created_at": "2024-10-10T22:57:11Z",
          "source_upvotes": 3,
          "source_url": null
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_1",
          "restaurant_attributes": [
            "special"
          ],
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_perrys_1",
          "source_content": "Long time Perry’s pork chop eater, first time poster. I am a HUGE steak person. I will admit, if I’m attending Perry’s on the company dime, I will usually order beef. HOWEVER until I tried the Perry’s pork chop I have never had a moist and tender pork dish. Man oh man did Perry’s prove my assumptions wrong. Their Friday special is not only a great deal but also delicious.",
          "source_id": "t1_lrirdbo",
          "source_type": "comment",
          "temp_id": "mention_t1_lrirdbo_1",
          "dish_attributes": [
            "moist",
            "tender"
          ],
          "dish_categories": [
            "pork chop",
            "pork",
            "chop"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Perry’s pork chop",
          "dish_primary_category": "pork chop",
          "dish_temp_id": "dish_pork_chop_1",
          "restaurant_attributes": [
            "friday special",
            "great deal"
          ],
          "restaurant_normalized_name": "perry's",
          "restaurant_original_text": "Perry’s",
          "source_created_at": "2024-10-11T03:03:10Z",
          "source_upvotes": 3,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_prime_rib",
          "dish_attributes": [
            "special",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_sides",
          "dish_attributes": null,
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side",
          "dish_temp_id": "dish_sides_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "r_maieday_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_maieday_t3_1g1dspf_primerib",
          "dish_attributes": [
            "10 oz",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_primerib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_costco_t1_lrlahsu",
          "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
          "source_id": "t1_lrlahsu",
          "source_type": "comment",
          "temp_id": "m_costco_t1_lrlahsu_hotdog",
          "dish_attributes": [
            "100% beef"
          ],
          "dish_categories": [
            "hot dog",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "hot dog deal",
          "dish_primary_category": "hot dog",
          "dish_temp_id": "d_hotdog_t1_lrlahsu",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "costco",
          "restaurant_original_text": "Costco",
          "source_created_at": "2024-10-11T15:45:13Z",
          "source_upvotes": 2,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_costco_t1_lrlahsu",
          "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
          "source_id": "t1_lrlahsu",
          "source_type": "comment",
          "temp_id": "m_costco_t1_lrlahsu_arrachera",
          "dish_attributes": [
            "grilled"
          ],
          "dish_categories": [
            "arrachera",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Arrachera package",
          "dish_primary_category": "arrachera",
          "dish_temp_id": "d_arrachera_t1_lrlahsu",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "costco",
          "restaurant_original_text": "Costco",
          "source_created_at": "2024-10-11T15:45:13Z",
          "source_upvotes": 2,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_costco_t1_lrlahsu",
          "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
          "source_id": "t1_lrlahsu",
          "source_type": "comment",
          "temp_id": "m_costco_t1_lrlahsu_beef",
          "dish_attributes": [
            "grilled"
          ],
          "dish_categories": [
            "beef"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "piece of beef",
          "dish_primary_category": "beef",
          "dish_temp_id": "d_beef_t1_lrlahsu",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "costco",
          "restaurant_original_text": "Costco",
          "source_created_at": "2024-10-11T15:45:13Z",
          "source_upvotes": 2,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_2",
          "dish_attributes": [
            "house roasted",
            "10 oz"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_days_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_1",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_days_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "d_house_roasted_beef_rib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maiedays",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_0",
          "dish_attributes": null,
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_maiedays_primerib",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maiedays",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "d_maiedays_primerib",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maiedays",
          "source_content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
          "source_id": "t1_lrfu1bn",
          "source_type": "comment",
          "temp_id": "m_t1_lrfu1bn_0",
          "dish_attributes": [
            "maldon salt"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "Prime Rib",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_maiedays_primerib",
          "restaurant_attributes": [
            "music"
          ],
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-10T15:49:21Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maiedays",
          "source_content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
          "source_id": "t1_lrfu1bn",
          "source_type": "comment",
          "temp_id": "m_t1_lrfu1bn_1",
          "dish_attributes": null,
          "dish_categories": [
            "biscuit"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "biscuits",
          "dish_primary_category": "biscuit",
          "dish_temp_id": "d_biscuit",
          "restaurant_attributes": [
            "music"
          ],
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-10T15:49:21Z",
          "source_upvotes": 1,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "r1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m1",
          "dish_attributes": [
            "special",
            "house roasted",
            "10 oz",
            "terrific"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "r2",
          "source_content": "Josephine House’s steak night on Monday’s is fantastic",
          "source_id": "t1_lrfvdnj",
          "source_type": "comment",
          "temp_id": "m2",
          "dish_attributes": [
            "night",
            "fantastic"
          ],
          "dish_categories": [
            "steak"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "steak night",
          "dish_primary_category": "steak",
          "dish_temp_id": "d2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "josephine house",
          "restaurant_original_text": "Josephine House’s",
          "source_created_at": "2024-10-10T15:56:35Z",
          "source_upvotes": 1,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T07:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Yum 😋",
          "source_id": "t1_lrhvymt",
          "source_type": "comment",
          "temp_id": "mention_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-10T15:34:14Z",
          "source_upvotes": 1,
          "source_url": ""
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": [
            "house roasted",
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef",
            "beef rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": [
            "daily specials"
          ],
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_2",
          "restaurant_attributes": [
            "daily specials"
          ],
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": [
            "prime",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted",
            "10 oz"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": [
            "daily special"
          ],
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_2",
          "dish_attributes": null,
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side",
          "dish_temp_id": "d_side_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_days_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_post_1",
          "dish_attributes": [
            "house roasted",
            "prime"
          ],
          "dish_categories": [
            "beef rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_beef_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_eurasia_1",
          "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
          "source_id": "t1_lrol3qk",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_1",
          "dish_attributes": null,
          "dish_categories": [
            "sushi roll",
            "sushi",
            "roll"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "sushi rolls",
          "dish_primary_category": "sushi roll",
          "dish_temp_id": "dish_sushi_roll_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "eurasia",
          "restaurant_original_text": "Eurasia",
          "source_created_at": "2024-10-12T05:07:01Z",
          "source_upvotes": 1,
          "source_url": null
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_eurasia_1",
          "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
          "source_id": "t1_lrol3qk",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_2",
          "dish_attributes": [
            "miso"
          ],
          "dish_categories": [
            "miso soup",
            "soup"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "miso soup",
          "dish_primary_category": "miso soup",
          "dish_temp_id": "dish_miso_soup_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "eurasia",
          "restaurant_original_text": "Eurasia",
          "source_created_at": "2024-10-12T05:07:01Z",
          "source_upvotes": 1,
          "source_url": null
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_eurasia_1",
          "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
          "source_id": "t1_lrol3qk",
          "source_type": "comment",
          "temp_id": "mention_comment_1_dish_3",
          "dish_attributes": null,
          "dish_categories": [
            "salad"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "salad",
          "dish_primary_category": "salad",
          "dish_temp_id": "dish_salad_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "eurasia",
          "restaurant_original_text": "Eurasia",
          "source_created_at": "2024-10-12T05:07:01Z",
          "source_upvotes": 1,
          "source_url": null
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_days_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_1",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef",
            "meat"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "d_prime_rib_special_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03+00:00",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_days_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef",
            "meat"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "d_beef_rib_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03+00:00",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "rest_maiedays_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "beef rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_beefrib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "rest_maiedays_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_primerib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "rest_maiedays_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_2",
          "dish_attributes": [
            "house roasted",
            "10 oz"
          ],
          "dish_categories": [
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "10 oz house roasted beef rib",
          "dish_primary_category": "beef rib",
          "dish_temp_id": "dish_beefrib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": true,
          "restaurant_temp_id": "rest_torchys_t1_lriz3q0",
          "source_content": "Anything at Torchys",
          "source_id": "t1_lriz3q0",
          "source_type": "comment",
          "temp_id": "mention_t1_lriz3q0_1",
          "dish_attributes": null,
          "dish_categories": null,
          "dish_is_menu_item": null,
          "dish_original_text": null,
          "dish_primary_category": null,
          "dish_temp_id": null,
          "restaurant_attributes": null,
          "restaurant_normalized_name": "torchys",
          "restaurant_original_text": "Torchys",
          "source_created_at": "2024-10-10T23:36:43Z",
          "source_upvotes": -2,
          "source_url": null
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "beef rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_prime_rib_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_t3_1g1dspf_2",
          "dish_attributes": [
            "terrific"
          ],
          "dish_categories": [
            "side"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "sides",
          "dish_primary_category": "side",
          "dish_temp_id": "dish_side_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_maie_day_t3_1g1dspf",
          "source_content": "it looks like someone made a diaper out of a steak but I would still eat the shit out of that. It looks amazing",
          "source_id": "t1_lrg2f0v",
          "source_type": "comment",
          "temp_id": "mention_t1_lrg2f0v_1",
          "dish_attributes": [
            "amazing"
          ],
          "dish_categories": [
            "steak",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "steak",
          "dish_primary_category": "steak",
          "dish_temp_id": "dish_steak_t1_lrg2f0v",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": null,
          "source_created_at": "2024-10-10T16:34:25Z",
          "source_upvotes": -3,
          "source_url": null
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "m_t3_1g1dspf_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "r_maie_day_t3_1g1dspf",
          "source_content": "Maie Day bitches",
          "source_id": "t1_lri6vt6",
          "source_type": "comment",
          "temp_id": "m_t1_lri6vt6_1",
          "dish_attributes": [
            "house roasted"
          ],
          "dish_categories": [
            "prime rib special",
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": null,
          "dish_primary_category": "prime rib special",
          "dish_temp_id": "d_prime_rib_special_t3_1g1dspf",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Day",
          "source_created_at": "2024-10-11T00:44:28Z",
          "source_upvotes": -3,
          "source_url": null
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "R1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "M1",
          "dish_attributes": [
            "special",
            "house roasted",
            "10 oz"
          ],
          "dish_categories": [
            "prime rib",
            "beef",
            "rib"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "D1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie days",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": false,
          "restaurant_temp_id": "R1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "M1",
          "dish_attributes": [
            "special",
            "house roasted"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "D1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        }
      ]
    },
    {
      "mentions": [
        {
          "general_praise": true,
          "restaurant_temp_id": "restaurant_1",
          "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others.",
          "source_id": "t3_1g1dspf",
          "source_type": "post",
          "temp_id": "mention_1",
          "dish_attributes": [
            "house roasted",
            "special"
          ],
          "dish_categories": [
            "prime rib",
            "rib",
            "beef"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "prime rib special",
          "dish_primary_category": "prime rib",
          "dish_temp_id": "dish_1",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "maie day",
          "restaurant_original_text": "Maie Days",
          "source_created_at": "2024-10-10T15:05:03Z",
          "source_upvotes": 345,
          "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/"
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_2",
          "source_content": "Yes. I’m a ribeye steak guy and I’m not a pork chop guy. Except for Perry’s. I’ll take a Perry’s pork chop over almost any cut of beef",
          "source_id": "t1_lrgogtu",
          "source_type": "comment",
          "temp_id": "mention_2",
          "dish_attributes": null,
          "dish_categories": [
            "pork chop",
            "pork"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "pork chop",
          "dish_primary_category": "pork chop",
          "dish_temp_id": "dish_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "perry's",
          "restaurant_original_text": "Perry’s",
          "source_created_at": "2024-10-10T18:36:30Z",
          "source_upvotes": 16,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_2",
          "source_content": "Exactly. Perry's pork chop is better than 90% of the steaks I've had in my life.",
          "source_id": "t1_lrkwu2b",
          "source_type": "comment",
          "temp_id": "mention_3",
          "dish_attributes": null,
          "dish_categories": [
            "pork chop",
            "pork"
          ],
          "dish_is_menu_item": true,
          "dish_original_text": "pork chop",
          "dish_primary_category": "pork chop",
          "dish_temp_id": "dish_2",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "perry's",
          "restaurant_original_text": "Perry's",
          "source_created_at": "2024-10-11T14:28:12Z",
          "source_upvotes": 1,
          "source_url": ""
        },
        {
          "general_praise": false,
          "restaurant_temp_id": "restaurant_2",
          "source_content": "I have had some dry ones on occasion as well. Unfortunately, the overall quality and experience at Perry's has declined even as the price has gone up. But it is still a pretty great lunch special.",
          "source_id": "t1_lrfy6qi",
          "source_type": "comment",
          "temp_id": "mention_4",
          "dish_attributes": [
            "lunch"
          ],
          "dish_categories": [
            "lunch special",
            "special"
          ],
          "dish_is_menu_item": false,
          "dish_original_text": "lunch special",
          "dish_primary_category": "lunch special",
          "dish_temp_id": "dish_3",
          "restaurant_attributes": null,
          "restaurant_normalized_name": "perry's",
          "restaurant_original_text": "Perry's",
          "source_created_at": "2024-10-10T16:51:40Z",
          "source_upvotes": 12,
          "source_url": ""
        }
      ]
    }
  ],
  "schemaValidation": {
    "passed": true,
    "errorCount": 0,
    "schemaType": "flat_with_all_properties_preserved"
  }
}

