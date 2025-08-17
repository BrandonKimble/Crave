{
  "testMetadata": {
    "testName": "CONCURRENT LLM PROCESSING - Context-Aware Chunking",
    "timestamp": "2025-08-16T21:50:04.176Z",
    "processingTime": 21866,
    "inputStats": {
      "posts": 1,
      "comments": 178
    },
    "outputStats": {
      "mentions": 82,
      "chunks": 44,
      "chunkSizes": [
        29,
        8,
        14,
        3,
        5,
        3,
        3,
        5,
        13,
        8,
        2,
        3,
        1,
        6,
        6,
        3,
        1,
        2,
        5,
        1,
        1,
        1,
        3,
        1,
        1,
        2,
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
        2,
        3,
        1,
        1,
        4,
        6,
        13
      ]
    },
    "performance": {
      "chunkingTime": 4,
      "concurrentProcessingTime": 21861,
      "totalTime": 21866,
      "successRate": 100,
      "averageChunkTime": 2.51984090909091
    }
  },
  "rawInput": {
    "posts": [
      {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfp6ta",
            "content": "Not sure that's better than Perry's Friday pork chop lunch special.",
            "author": "Tweedle_DeeDum",
            "score": 262,
            "created_at": "2024-10-11T16:43:23.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6ta/"
          },
          {
            "id": "t1_lrgauhf",
            "content": "Brother, we’re talking about pork and prime rib here. Are you serious?",
            "author": "wulfgyang",
            "score": 22,
            "created_at": "2024-10-11T18:40:33.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgauhf/"
          },
          {
            "id": "t1_lrgb9lo",
            "content": "It's a real big pork chop.",
            "author": "Odd_Bodkin",
            "score": 86,
            "created_at": "2024-10-11T18:42:49.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgb9lo/"
          },
          {
            "id": "t1_lrge5sz",
            "content": "I’ve had it, I’ll say it’s good. But that’s prime rib on his plate for the same price.",
            "author": "wulfgyang",
            "score": 18,
            "created_at": "2024-10-11T18:58:45.000Z",
            "parent_id": "t1_lrgb9lo",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrge5sz/"
          },
          {
            "id": "t1_lrggn7s",
            "content": "Well, the plate shown by OP is actually $35 but then the sides at Perry's are not cheap either.  \n\nThe Perry chop is 1.5lbs and includes mashed potatoes and apple sauce.  My experience is that you either split it with someone or have a second meal of leftovers.\n\nThey will split it for you when you order if you ask.",
            "author": "Tweedle_DeeDum",
            "score": 38,
            "created_at": "2024-10-11T19:12:35.000Z",
            "parent_id": "t1_lrge5sz",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggn7s/"
          },
          {
            "id": "t1_lrhlb83",
            "content": "Worst part about it is that it’s on Friday, and every I’d leave it in the fridge at work and forget it every damn time",
            "author": "skratsda",
            "score": 5,
            "created_at": "2024-10-11T23:14:53.000Z",
            "parent_id": "t1_lrggn7s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhlb83/"
          },
          {
            "id": "t1_lrhujz5",
            "content": "You're not supposed to go back to work after Friday pork chop lunch at Perry's",
            "author": "quirino254",
            "score": 44,
            "created_at": "2024-10-12T00:17:53.000Z",
            "parent_id": "t1_lrhlb83",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhujz5/"
          },
          {
            "id": "t1_lrgogtu",
            "content": "Yes. I’m a ribeye steak guy and I’m not a pork chop guy. Except for Perry’s. I’ll take a Perry’s pork chop over almost any cut of beef",
            "author": "Zurrascaped",
            "score": 17,
            "created_at": "2024-10-11T19:56:30.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgogtu/"
          },
          {
            "id": "t1_lrkwu2b",
            "content": "Exactly. Perry's pork chop is better than 90% of the steaks I've had in my life.",
            "author": "qaat",
            "score": 1,
            "created_at": "2024-10-12T15:48:12.000Z",
            "parent_id": "t1_lrgogtu",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkwu2b/"
          },
          {
            "id": "t1_lri23ke",
            "content": "The seasoning for prime rib comes from the au jus. It’s the tenderness of the meat plus the saltiness of the au jus that makes the whole experience. \n\nIt is not just my favorite preparation of beef, it is my favorite food period. I am not allured by the price. There is plenty of expensive food that I could care less about (filet mignon comes to mind).",
            "author": "regissss",
            "score": 4,
            "created_at": "2024-10-12T01:10:09.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri23ke/"
          },
          {
            "id": "t1_lri6oj7",
            "content": "Yep prime rib is overrated",
            "author": "XTingleInTheDingleX",
            "score": 1,
            "created_at": "2024-10-12T01:43:03.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6oj7/"
          },
          {
            "id": "t1_lrh6ev9",
            "content": "Prime rib isn’t seasoned? That seems like a preparation issue, also there’s an au jus for a reason.",
            "author": "southpark",
            "score": 1,
            "created_at": "2024-10-11T21:39:19.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh6ev9/"
          },
          {
            "id": "t1_lrgj2dr",
            "content": "Have you had the pork chop being referenced? This isn’t like a Sam’s club special pork chop…",
            "author": "pbagwell84",
            "score": 13,
            "created_at": "2024-10-11T19:26:12.000Z",
            "parent_id": "t1_lrge5sz",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgj2dr/"
          },
          {
            "id": "t1_lrk2fx9",
            "content": "They smoked their pork chop for 4 to 6 hours. Then they see it with a brown sugar like rub.  The darker it is more tender it is. Like many have said it can be dry sometimes if it hasn’t been smoked for long enough, but it still an excellent deal. \nI know the domain location gets slammed where they have to serve over 1000 pork chops on Friday during lunch  so the consistency may not be as tender as dinner time.",
            "author": "AutofillUserID",
            "score": 2,
            "created_at": "2024-10-12T12:37:03.000Z",
            "parent_id": "t1_lrgj2dr",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk2fx9/"
          },
          {
            "id": "t1_lrkfsw9",
            "content": "Interesting. I didn’t know how it was prepared, just that it is delicious. I love the three different sections, as they do feel like 3 completely different pieces of meat, all served on one plate. Naturally, my first time having it was the best and other times it hasn’t been quite as good, but always very tasty and the deal on Friday is just a bonus.",
            "author": "pbagwell84",
            "score": 1,
            "created_at": "2024-10-12T14:08:32.000Z",
            "parent_id": "t1_lrk2fx9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkfsw9/"
          },
          {
            "id": "t1_lrnpdao",
            "content": "Prime rib is gross",
            "author": "[deleted]",
            "score": 1,
            "created_at": "2024-10-13T01:51:36.000Z",
            "parent_id": "t1_lrge5sz",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrnpdao/"
          },
          {
            "id": "t1_lrhldza",
            "content": "I don’t know if you’ve had it but it’s a REALLY good pork chop. Never had anything like it.",
            "author": "KendrickBlack502",
            "score": 6,
            "created_at": "2024-10-11T23:15:24.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhldza/"
          },
          {
            "id": "t1_lrjzosz",
            "content": "Prime rib is garbage",
            "author": "Longhorn24",
            "score": 1,
            "created_at": "2024-10-12T12:15:32.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjzosz/"
          },
          {
            "id": "t1_lrkkbdj",
            "content": "No question. Pork over beef all day.",
            "author": "Yooooooooooo0o",
            "score": 1,
            "created_at": "2024-10-12T14:35:54.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkkbdj/"
          },
          {
            "id": "t1_lrig5px",
            "content": "Perry's pork chop is incredible. Add in the applesauce snf fuck yes.",
            "author": "crabby-owlbear",
            "score": 10,
            "created_at": "2024-10-12T02:51:08.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrig5px/"
          },
          {
            "id": "t1_lrgu3kx",
            "content": "Honestly tell me what's so great about Perry's? I've only been once, two of us ate and the bill was over $200 not including tip. The pork chop was tough, the ribeye steak was just okay and the sides were forgettable. I will say it was the Domain location and I've only been once but I was super unimpressed.  It's just not worth the price.",
            "author": "AnnieB512",
            "score": 2,
            "created_at": "2024-10-11T20:28:02.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgu3kx/"
          },
          {
            "id": "t1_lrifho4",
            "content": "Huge difference between the Domain and downtown location in my experience. Been a few years since I was last there but the downtown location I've eaten a few times and had good experiences each time. The Domain location was terrible for me",
            "author": "tzejin",
            "score": 6,
            "created_at": "2024-10-12T02:46:13.000Z",
            "parent_id": "t1_lrgu3kx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrifho4/"
          },
          {
            "id": "t1_lrjgas7",
            "content": "I've had the pork chop over a dozen times at three different locations across Texas. Never once was it tough.\n\nNormally, Perry's is an expensive place. I mean, they charge $14 for a house Caesar salad! However, the Friday pork chop special is just that, damn special! If you can refrain from ordering apps, cocktails, starter salads, and dessert, a $20 meal that could easily be split into two portions is a big win in 2024.",
            "author": "Stickyv35",
            "score": 3,
            "created_at": "2024-10-12T08:53:00.000Z",
            "parent_id": "t1_lrgu3kx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjgas7/"
          },
          {
            "id": "t1_lrjx7hn",
            "content": "And they serve shriveled up hamburgers that are 2 inches too small for the bun.",
            "author": "finger_foodie",
            "score": 2,
            "created_at": "2024-10-12T11:55:16.000Z",
            "parent_id": "t1_lrgu3kx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjx7hn/"
          },
          {
            "id": "t1_lri4mc9",
            "content": "Both excellent, can't compare prime rib vs porkchop though.",
            "author": "ac_slat3r",
            "score": 1,
            "created_at": "2024-10-12T01:28:09.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4mc9/"
          },
          {
            "id": "t1_lrj5ndp",
            "content": "Perry's pork chop is half the size it used to be.  And it used to be great, like pre 2012, it's a far cry from what it used to be.  My last few visits there have been horrible.  Dried overcooked and salty small pork chop, haven't been back since 2021.",
            "author": "elibutton",
            "score": 0,
            "created_at": "2024-10-12T06:47:14.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj5ndp/"
          },
          {
            "id": "t1_lrk3ji8",
            "content": "Back in the day, I think the $12 lunch chop was the same 3-4 bone 32oz chop they serve at dinner. Now it is a 2 bone 18oz chop that goes for $19. So definitely not the deal it used to be.\n\nI don't think that it is small in absolute terms but certainly smaller than it used to be.\n\nThe big loss for me was when they stopped carving it table side.",
            "author": "Tweedle_DeeDum",
            "score": 2,
            "created_at": "2024-10-12T12:45:16.000Z",
            "parent_id": "t1_lrj5ndp",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk3ji8/"
          },
          {
            "id": "t1_lrgmrdq",
            "content": "Yeah, we get it, it's a great pork chop and good deal.\n\nBut how many times are you gonna post about it here?\n\nAre you a Perry's employee???",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T19:47:05.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgmrdq/"
          },
          {
            "id": "t1_lrh0eik",
            "content": "I think I was just participating in a conversation, in an agreeable and polite manner.\n\nYou should try it.\n\nNot affiliated with Perry's.",
            "author": "Tweedle_DeeDum",
            "score": 14,
            "created_at": "2024-10-11T21:03:46.000Z",
            "parent_id": "t1_lrgmrdq",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh0eik/"
          },
          {
            "id": "t1_lrh15ru",
            "content": "&gt;I think I was just participating in a conversation\n\nWhich you keep doing over and over and over in this sub about their pork chop.\n\nWe all already know it's a good pork chop, Perry's employee.",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T21:08:12.000Z",
            "parent_id": "t1_lrh0eik",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh15ru/"
          },
          {
            "id": "t1_lrh1vl5",
            "content": "Can you guys just go on a date already.\n\n\nI recommend Perry's ",
            "author": "z64_dan",
            "score": 18,
            "created_at": "2024-10-11T21:12:22.000Z",
            "parent_id": "t1_lrh15ru",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1vl5/"
          },
          {
            "id": "t1_lrh5hr1",
            "content": "I've heard their pork chop is pretty good.",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T21:33:47.000Z",
            "parent_id": "t1_lrh1vl5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh5hr1/"
          },
          {
            "id": "t1_lrh3amy",
            "content": "I'll post what I like and when I like, Karen.  But this conversation is clearly not value-added so feel free to have the last word.",
            "author": "Tweedle_DeeDum",
            "score": 11,
            "created_at": "2024-10-11T21:20:38.000Z",
            "parent_id": "t1_lrh15ru",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh3amy/"
          },
          {
            "id": "t1_lrh5ryd",
            "content": "No u.",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T21:35:28.000Z",
            "parent_id": "t1_lrh3amy",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh5ryd/"
          },
          {
            "id": "t1_lrfwgya",
            "content": "Try looking for a moist one. They're much better!",
            "author": "Reddit_Commenter_69",
            "score": 43,
            "created_at": "2024-10-11T17:22:26.000Z",
            "parent_id": "t1_lrftnvn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfwgya/"
          },
          {
            "id": "t1_lrfy6qi",
            "content": "I have had some dry ones on occasion as well.  Unfortunately, the overall quality and experience at Perry's has declined even as the price has gone up. But it is still a pretty great lunch special.",
            "author": "Tweedle_DeeDum",
            "score": 11,
            "created_at": "2024-10-11T17:31:40.000Z",
            "parent_id": "t1_lrftnvn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy6qi/"
          },
          {
            "id": "t1_lrggzjo",
            "content": "I've had the opposite problem with the Brussel sprouts.  You can send them back if they are not done correctly.",
            "author": "Tweedle_DeeDum",
            "score": 1,
            "created_at": "2024-10-11T19:14:31.000Z",
            "parent_id": "t1_lrgd4xr",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggzjo/"
          },
          {
            "id": "t1_lriowpi",
            "content": "It's probably all the money Chris Perry is spending on all the lawsuits. All of his many, many, *many* lawsuits for wage theft.",
            "author": "ApprehensiveHippo401",
            "score": 1,
            "created_at": "2024-10-12T04:01:24.000Z",
            "parent_id": "t1_lrfy6qi",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lriowpi/"
          },
          {
            "id": "t1_lrg44xt",
            "content": "This. It’s a terrible way to cook a pork chop. It’s not even worth keeping the leftovers the few times I’ve been.",
            "author": "stevendaedelus",
            "score": 0,
            "created_at": "2024-10-11T18:03:45.000Z",
            "parent_id": "t1_lrftnvn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg44xt/"
          },
          {
            "id": "t1_lrmmwdy",
            "content": "Thanks. Apparently we committed heresy by saying it’s often dry",
            "author": "canofspam2020",
            "score": 2,
            "created_at": "2024-10-12T21:40:06.000Z",
            "parent_id": "t1_lrg44xt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrmmwdy/"
          },
          {
            "id": "t1_lrn038v",
            "content": "Fuck em if they like a poorly cooked pork chop.",
            "author": "stevendaedelus",
            "score": 1,
            "created_at": "2024-10-12T23:04:04.000Z",
            "parent_id": "t1_lrmmwdy",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrn038v/"
          },
          {
            "id": "t1_lrfp6g7",
            "content": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
            "author": "WelcomeToBrooklandia",
            "score": 110,
            "created_at": "2024-10-11T16:43:20.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6g7/"
          },
          {
            "id": "t1_lrg0vke",
            "content": "Habanero lunch special prices make you feel like you time traveled back to 2011.",
            "author": "austinoracle",
            "score": 34,
            "created_at": "2024-10-11T17:46:14.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0vke/"
          },
          {
            "id": "t1_lrg5lml",
            "content": "Beef fajita ranchera plate is king of the lunch specials for me. 🫶🏼",
            "author": "Coujelais",
            "score": 12,
            "created_at": "2024-10-11T18:11:40.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg5lml/"
          },
          {
            "id": "t1_lri4iq4",
            "content": "I love that little spot.",
            "author": "starillin",
            "score": 2,
            "created_at": "2024-10-12T01:27:28.000Z",
            "parent_id": "t1_lrg5lml",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4iq4/"
          },
          {
            "id": "t1_lri4y07",
            "content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥️♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
            "author": "Coujelais",
            "score": 5,
            "created_at": "2024-10-12T01:30:30.000Z",
            "parent_id": "t1_lri4iq4",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/"
          },
          {
            "id": "t1_lri1173",
            "content": "Chilakillers gigantic burrito plate for 6.99. Nuff said",
            "author": "ChickonKiller",
            "score": 6,
            "created_at": "2024-10-12T01:02:31.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri1173/"
          },
          {
            "id": "t1_lrfzeat",
            "content": "Prime rib is a roast, not a steak.",
            "author": "sqweak",
            "score": 0,
            "created_at": "2024-10-11T17:38:16.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfzeat/"
          },
          {
            "id": "t1_lrg0ihy",
            "content": "OK? My point still stands. \n\n\"You're still getting an excellent BEEF meal for $35.\" Feel better now?",
            "author": "WelcomeToBrooklandia",
            "score": 27,
            "created_at": "2024-10-11T17:44:17.000Z",
            "parent_id": "t1_lrfzeat",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0ihy/"
          },
          {
            "id": "t1_lrfuod7",
            "content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
            "author": "genteelbartender",
            "score": 84,
            "created_at": "2024-10-11T17:12:47.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfuod7/"
          },
          {
            "id": "t1_lrg46x1",
            "content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
            "author": "RoleModelsinBlood31",
            "score": 33,
            "created_at": "2024-10-11T18:04:03.000Z",
            "parent_id": "t1_lrfuod7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg46x1/"
          },
          {
            "id": "t1_lrg62bj",
            "content": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
            "author": "genteelbartender",
            "score": 10,
            "created_at": "2024-10-11T18:14:14.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg62bj/"
          },
          {
            "id": "t1_lrg7x0s",
            "content": "Yep, they’re pretty consistent, and busy as hell.  I really don’t think I’ve ever been there when it’s not packed all times of the day.  Just reminds me of all the fairly priced places from the 90’s that didn’t knock your socks off or did anything mind blowing but they were always consistent and had good food",
            "author": "RoleModelsinBlood31",
            "score": 14,
            "created_at": "2024-10-11T18:24:26.000Z",
            "parent_id": "t1_lrg62bj",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg7x0s/"
          },
          {
            "id": "t1_lrjh8q0",
            "content": "100%. It feels nostalgic, which post-Covid is a welcomed feeling! It's the go-to in the budget category for us.\n\nYou're making me want to buy some shares, too!",
            "author": "Stickyv35",
            "score": 3,
            "created_at": "2024-10-12T09:04:21.000Z",
            "parent_id": "t1_lrg7x0s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjh8q0/"
          },
          {
            "id": "t1_lrg82ss",
            "content": "Tx Roadhouse is basically the new Lubys.",
            "author": "genteelbartender",
            "score": 1,
            "created_at": "2024-10-11T18:25:18.000Z",
            "parent_id": "t1_lrg7x0s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg82ss/"
          },
          {
            "id": "t1_lrgidu1",
            "content": "comparing a place that offers steaks and whatnot to a place that is cafeteria food is wild.",
            "author": "__vheissu__",
            "score": 4,
            "created_at": "2024-10-11T19:22:19.000Z",
            "parent_id": "t1_lrg82ss",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgidu1/"
          },
          {
            "id": "t1_lrgj393",
            "content": "You clearly never went to Lubys in its heyday. Lubys is country food, just like Texas Roadhouse. But also, I challenge you to go to each place around 4pm and tell me it’s not the same demo.",
            "author": "genteelbartender",
            "score": 12,
            "created_at": "2024-10-11T19:26:20.000Z",
            "parent_id": "t1_lrgidu1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgj393/"
          },
          {
            "id": "t1_lrgj84g",
            "content": "I’m not 80 years old, I didnt get to experience their “heyday”.",
            "author": "__vheissu__",
            "score": 0,
            "created_at": "2024-10-11T19:27:06.000Z",
            "parent_id": "t1_lrgj393",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgj84g/"
          },
          {
            "id": "t1_lrjhgtc",
            "content": "Neither am I. But I do remember Luby's being fantastic in the late 90's, early 2000's. It started to change around the 2010's IMO.",
            "author": "Stickyv35",
            "score": 2,
            "created_at": "2024-10-12T09:07:04.000Z",
            "parent_id": "t1_lrgj84g",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjhgtc/"
          },
          {
            "id": "t1_lrg63c6",
            "content": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
            "author": "genteelbartender",
            "score": 2,
            "created_at": "2024-10-11T18:14:23.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg63c6/"
          },
          {
            "id": "t1_lrg81yv",
            "content": "I went bc i was on a road trip. It's pretty middling quality. Rolls are great.",
            "author": "OhYerSoKew",
            "score": 2,
            "created_at": "2024-10-11T18:25:11.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg81yv/"
          },
          {
            "id": "t1_lrjh0n4",
            "content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
            "author": "Stickyv35",
            "score": 1,
            "created_at": "2024-10-12T09:01:38.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjh0n4/"
          },
          {
            "id": "t1_lrgm3rj",
            "content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
            "author": "slamminsalmoncannon",
            "score": 8,
            "created_at": "2024-10-11T19:43:26.000Z",
            "parent_id": "t1_lrfuod7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgm3rj/"
          },
          {
            "id": "t1_lrg1s92",
            "content": "Jack Allen’s happy hour is half off apps. You can get literally every app, like 8 different ones, for like $50. It’s a ton of food and a great deal.",
            "author": "IAmSportikus",
            "score": 32,
            "created_at": "2024-10-11T17:51:04.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1s92/"
          },
          {
            "id": "t1_lrj153e",
            "content": "Fonda San Miguel used to do this. Was an awesome deal.",
            "author": "genteelbartender",
            "score": 5,
            "created_at": "2024-10-12T05:57:48.000Z",
            "parent_id": "t1_lrg1s92",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj153e/"
          },
          {
            "id": "t1_lrkdfp1",
            "content": "What happened to JA? Went to the oak hill one like always last month and it was terrible. Seemed like a change in food supply, chicken was smaller dry pieces, gravy and CFS sucked. Was embarrassed I took some visiting family there.",
            "author": "macgrubersir",
            "score": 0,
            "created_at": "2024-10-12T13:53:23.000Z",
            "parent_id": "t1_lrg1s92",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkdfp1/"
          },
          {
            "id": "t1_lrfthzm",
            "content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
            "author": "longhorn_2017",
            "score": 27,
            "created_at": "2024-10-11T17:06:26.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfthzm/"
          },
          {
            "id": "t1_lrfxhh3",
            "content": "Is the prime rib/potato deal also on the lunch menu?",
            "author": "megaphoneXX",
            "score": 3,
            "created_at": "2024-10-11T17:27:52.000Z",
            "parent_id": "t1_lrfthzm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfxhh3/"
          },
          {
            "id": "t1_lrfz7kn",
            "content": "I believe it's only on the lunch menu!",
            "author": "longhorn_2017",
            "score": 2,
            "created_at": "2024-10-11T17:37:14.000Z",
            "parent_id": "t1_lrfxhh3",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfz7kn/"
          },
          {
            "id": "t1_lrgfw54",
            "content": "is that only Fridays?",
            "author": "FakeEmpire20",
            "score": 2,
            "created_at": "2024-10-11T19:08:23.000Z",
            "parent_id": "t1_lrfthzm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgfw54/"
          },
          {
            "id": "t1_lrghyvm",
            "content": "Yes, they're only open for lunch on Friday.",
            "author": "longhorn_2017",
            "score": 3,
            "created_at": "2024-10-11T19:19:59.000Z",
            "parent_id": "t1_lrgfw54",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrghyvm/"
          },
          {
            "id": "t1_lrfqypm",
            "content": "HUGE pork-chop at Perry’s in domain or 7th Street is the best special \nback in my day, price was about $14… now it’s up to $19… Rambles about inflation 😝",
            "author": "Beneficial-Stable-66",
            "score": 27,
            "created_at": "2024-10-11T16:52:49.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfqypm/"
          },
          {
            "id": "t1_lri5neu",
            "content": "I remember having it when it was $11. If it was never $11, then I don’t know what I remember. I’m old. But even as a person who doesn’t generally like pork, it actually is quite good.",
            "author": "leavinonajetplane7",
            "score": 2,
            "created_at": "2024-10-12T01:35:39.000Z",
            "parent_id": "t1_lrfqypm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri5neu/"
          },
          {
            "id": "t1_lrjhtmt",
            "content": "In before that one guy drop by bitching that you're a Perry's employee or something! 🤣",
            "author": "Stickyv35",
            "score": 2,
            "created_at": "2024-10-12T09:11:24.000Z",
            "parent_id": "t1_lrfqypm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjhtmt/"
          },
          {
            "id": "t1_lrgdaji",
            "content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
            "author": "Open-EyedTraveler",
            "score": 24,
            "created_at": "2024-10-11T18:53:59.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgdaji/"
          },
          {
            "id": "t1_lrgipxt",
            "content": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
            "author": "WelcomeToBrooklandia",
            "score": 12,
            "created_at": "2024-10-11T19:24:14.000Z",
            "parent_id": "t1_lrgdaji",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgipxt/"
          },
          {
            "id": "t1_lrlwx6z",
            "content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
            "author": "Open-EyedTraveler",
            "score": 1,
            "created_at": "2024-10-12T19:08:13.000Z",
            "parent_id": "t1_lrgipxt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlwx6z/"
          },
          {
            "id": "t1_lrij949",
            "content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
            "author": "laffs4jeffy",
            "score": 7,
            "created_at": "2024-10-12T03:15:03.000Z",
            "parent_id": "t1_lrgdaji",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrij949/"
          },
          {
            "id": "t1_lrt967k",
            "content": "They also do a steak night on Sundays! Love Hillside.",
            "author": "FakeEmpire20",
            "score": 1,
            "created_at": "2024-10-14T01:26:49.000Z",
            "parent_id": "t1_lrgdaji",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrt967k/"
          },
          {
            "id": "t1_lrgn98r",
            "content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
            "author": "kanyeguisada",
            "score": 25,
            "created_at": "2024-10-11T19:49:51.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgn98r/"
          },
          {
            "id": "t1_lrj1e65",
            "content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
            "author": "modernmovements",
            "score": 3,
            "created_at": "2024-10-12T06:00:26.000Z",
            "parent_id": "t1_lrgn98r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj1e65/"
          },
          {
            "id": "t1_lrip6oa",
            "content": "Interesting",
            "author": "Arty_Puls",
            "score": 2,
            "created_at": "2024-10-12T04:03:48.000Z",
            "parent_id": "t1_lrgn98r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrip6oa/"
          },
          {
            "id": "t1_lrfq0jn",
            "content": "Carve lunch deal rivals it. \n\nBut a prime rib like my dad ate..",
            "author": "IdeaJason",
            "score": 18,
            "created_at": "2024-10-11T16:47:47.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfq0jn/"
          },
          {
            "id": "t1_lrfqw49",
            "content": "Whats this deal?",
            "author": "Street-Ask5154",
            "score": 3,
            "created_at": "2024-10-11T16:52:27.000Z",
            "parent_id": "t1_lrfq0jn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfqw49/"
          },
          {
            "id": "t1_lrfsm6j",
            "content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
            "author": "IdeaJason",
            "score": 21,
            "created_at": "2024-10-11T17:01:37.000Z",
            "parent_id": "t1_lrfqw49",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfsm6j/"
          },
          {
            "id": "t1_lrfzqe7",
            "content": "This has been my go to Friday lunch for a while. IMO it’s the best steak special in town.",
            "author": "sqweak",
            "score": 1,
            "created_at": "2024-10-11T17:40:05.000Z",
            "parent_id": "t1_lrfsm6j",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfzqe7/"
          },
          {
            "id": "t1_lrg090q",
            "content": "And quite possibly the finest cut of meat for the price I've ever encountered.",
            "author": "IdeaJason",
            "score": 2,
            "created_at": "2024-10-11T17:42:51.000Z",
            "parent_id": "t1_lrfzqe7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg090q/"
          },
          {
            "id": "t1_lrh8960",
            "content": "How is the smokiness of that New York strip? Sounds really good. \n\nEdit: Never had a smoked steak!",
            "author": "ActionPerkins",
            "score": 1,
            "created_at": "2024-10-11T21:50:33.000Z",
            "parent_id": "t1_lrg090q",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh8960/"
          },
          {
            "id": "t1_lrfsnb8",
            "content": "From the website: Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19 every Friday (11am to 5pm)",
            "author": "MilesandOz",
            "score": 6,
            "created_at": "2024-10-11T17:01:47.000Z",
            "parent_id": "t1_lrfqw49",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfsnb8/"
          },
          {
            "id": "t1_lu3s7qg",
            "content": "Yup this is the move ",
            "author": "melvinmayhem1337",
            "score": 2,
            "created_at": "2024-10-28T00:58:50.000Z",
            "parent_id": "t1_lrfq0jn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lu3s7qg/"
          },
          {
            "id": "t1_lrfy5gn",
            "content": "Free prime rib at palazio. Every first Friday.",
            "author": "PristineDriver6485",
            "score": 18,
            "created_at": "2024-10-11T17:31:29.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy5gn/"
          },
          {
            "id": "t1_lrhref5",
            "content": "You not gonna walk out of there spending less than $19.  LOL",
            "author": "TX_spacegeek",
            "score": 10,
            "created_at": "2024-10-11T23:56:08.000Z",
            "parent_id": "t1_lrfy5gn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhref5/"
          },
          {
            "id": "t1_lrge61r",
            "content": "This looks like the food we give patients with swallowing issues, in the hospital.  😬",
            "author": "lawlislr",
            "score": 16,
            "created_at": "2024-10-11T18:58:47.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrge61r/"
          },
          {
            "id": "t1_lrie17a",
            "content": "And as pictured I think it's $35 where their wording seems purposefully obtuse to make it seem as if it's actually $19.",
            "author": "Econolife-350",
            "score": 8,
            "created_at": "2024-10-12T02:35:59.000Z",
            "parent_id": "t1_lrge61r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrie17a/"
          },
          {
            "id": "t1_lrkdwwk",
            "content": "Prime rib for swallowing issues lolol",
            "author": "Coujelais",
            "score": 2,
            "created_at": "2024-10-12T13:56:30.000Z",
            "parent_id": "t1_lrge61r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkdwwk/"
          },
          {
            "id": "t1_lrfryrh",
            "content": "Polazios 1st Friday’s $10 prime rib.",
            "author": "LongShotLives",
            "score": 20,
            "created_at": "2024-10-11T16:58:08.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfryrh/"
          },
          {
            "id": "t1_lrgd76l",
            "content": "The strip club?",
            "author": "[deleted]",
            "score": 6,
            "created_at": "2024-10-11T18:53:28.000Z",
            "parent_id": "t1_lrfryrh",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgd76l/"
          },
          {
            "id": "t1_lrgg7ey",
            "content": "Yes",
            "author": "LongShotLives",
            "score": 7,
            "created_at": "2024-10-11T19:10:07.000Z",
            "parent_id": "t1_lrgd76l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgg7ey/"
          },
          {
            "id": "t1_lrhj4rv",
            "content": "Do I have to pay to enter the club? Or can I just go in, eat my meat and leave ?",
            "author": "PrizeNo2127",
            "score": 4,
            "created_at": "2024-10-11T23:00:24.000Z",
            "parent_id": "t1_lrfryrh",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhj4rv/"
          },
          {
            "id": "t1_lrhlwb5",
            "content": "Yeah. Go in and eat and leave. No one is going to keep you there. No 2 drink minimum if that’s what you are worried about.",
            "author": "LongShotLives",
            "score": 4,
            "created_at": "2024-10-11T23:18:48.000Z",
            "parent_id": "t1_lrhj4rv",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhlwb5/"
          },
          {
            "id": "t1_lri23ih",
            "content": "I was worried I would have to buy a lap dance too",
            "author": "PrizeNo2127",
            "score": 5,
            "created_at": "2024-10-12T01:10:08.000Z",
            "parent_id": "t1_lrhlwb5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri23ih/"
          },
          {
            "id": "t1_lri6mkd",
            "content": "That’s up to you friendo 😉",
            "author": "LongShotLives",
            "score": 5,
            "created_at": "2024-10-12T01:42:40.000Z",
            "parent_id": "t1_lri23ih",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6mkd/"
          },
          {
            "id": "t1_lrwczkm",
            "content": "\\*beat",
            "author": "red_ocean5",
            "score": 1,
            "created_at": "2024-10-14T16:37:04.000Z",
            "parent_id": "t1_lrhj4rv",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrwczkm/"
          },
          {
            "id": "t1_lrgk608",
            "content": "Be honest , you don’t go to polazios because of the prime rib.",
            "author": "pompom_waver",
            "score": 2,
            "created_at": "2024-10-11T19:32:27.000Z",
            "parent_id": "t1_lrfryrh",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgk608/"
          },
          {
            "id": "t1_lrgmzdw",
            "content": "Prime rib with a view😎",
            "author": "LongShotLives",
            "score": 11,
            "created_at": "2024-10-11T19:48:20.000Z",
            "parent_id": "t1_lrgk608",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgmzdw/"
          },
          {
            "id": "t1_lrgxidm",
            "content": "Steak &amp; Leggs",
            "author": "PristineDriver6485",
            "score": 15,
            "created_at": "2024-10-11T20:47:07.000Z",
            "parent_id": "t1_lrgmzdw",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgxidm/"
          },
          {
            "id": "t1_lrgy5yh",
            "content": "I like yo style my friend. 🤘🏽",
            "author": "LongShotLives",
            "score": 5,
            "created_at": "2024-10-11T20:50:51.000Z",
            "parent_id": "t1_lrgxidm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgy5yh/"
          },
          {
            "id": "t1_lri3zqp",
            "content": "Tits 'n' Taters",
            "author": "Flaky_Floor_6390",
            "score": 6,
            "created_at": "2024-10-12T01:23:39.000Z",
            "parent_id": "t1_lrgxidm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri3zqp/"
          },
          {
            "id": "t1_lrfm0kg",
            "content": "Damn that is a good deal I really wish I wasn't working today",
            "author": "titos334",
            "score": 12,
            "created_at": "2024-10-11T16:26:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfm0kg/"
          },
          {
            "id": "t1_lrfswd5",
            "content": "What does \"both sides\" mean? What does \"opt in\" mean?\n\nWhat do you mean by \"otherwise\" I'm so confused lol",
            "author": "EbagI",
            "score": 11,
            "created_at": "2024-10-11T17:03:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfswd5/"
          },
          {
            "id": "t1_lrft9jt",
            "content": "The prime rib is 19$. The potatoes and creamed kale are sides. You can may 8$ for each of them. Otherwise would mean you didn’t add them.",
            "author": "Street-Ask5154",
            "score": 4,
            "created_at": "2024-10-11T17:05:10.000Z",
            "parent_id": "t1_lrfswd5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrft9jt/"
          },
          {
            "id": "t1_lrftnb9",
            "content": "Jesus Christ, I completely did not understand \"sides\" as in, side dishes 😂 \n\nCompletely me being an idiot. I have no idea why I did not understand that, thank you so much for spelling it out ❤️ thank you for the post in general",
            "author": "EbagI",
            "score": 21,
            "created_at": "2024-10-11T17:07:14.000Z",
            "parent_id": "t1_lrft9jt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrftnb9/"
          },
          {
            "id": "t1_lrfwgmw",
            "content": "You are not alone. For some reason I was confused by the wording as well. I thought both sides referred to the restaurant having two entrances or something lol, or both sides of the beef maybe?",
            "author": "funkmastamatt",
            "score": 9,
            "created_at": "2024-10-11T17:22:24.000Z",
            "parent_id": "t1_lrftnb9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfwgmw/"
          },
          {
            "id": "t1_lrgaqkb",
            "content": "Me three..  At first I thought OP meant both sides of the prime rib.  Lol.",
            "author": "llamawc77",
            "score": 3,
            "created_at": "2024-10-11T18:39:56.000Z",
            "parent_id": "t1_lrfwgmw",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgaqkb/"
          },
          {
            "id": "t1_lrh3e4s",
            "content": "I initially read that as both sides of the prime rib are terrific 😂",
            "author": "trainwreckchococat",
            "score": 3,
            "created_at": "2024-10-11T21:21:12.000Z",
            "parent_id": "t1_lrftnb9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh3e4s/"
          },
          {
            "id": "t1_lrg0qtx",
            "content": "Op forgot to mention they charge an arm and a leg for the sides.  The prime rib special is just that.  \nAs shown I think it’s a 30-35 dollar plate. So he’ll no. I went there once.",
            "author": "AutofillUserID",
            "score": 10,
            "created_at": "2024-10-11T17:45:32.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0qtx/"
          },
          {
            "id": "t1_lrg1ccu",
            "content": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
            "author": "WelcomeToBrooklandia",
            "score": 4,
            "created_at": "2024-10-11T17:48:44.000Z",
            "parent_id": "t1_lrg0qtx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1ccu/"
          },
          {
            "id": "t1_lrh0oja",
            "content": "Not really a deal at $35.  It’s ok normal pricing for the location. The Perry Friday special is mad popular.  \nMaie Day is just not busy with their special that’s been there for a long time.",
            "author": "AutofillUserID",
            "score": 6,
            "created_at": "2024-10-11T21:05:24.000Z",
            "parent_id": "t1_lrg1ccu",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh0oja/"
          },
          {
            "id": "t1_lrh1fba",
            "content": "Perry's has been around a lot longer than Maie Day. Makes sense that their special is more popular/well-known. \n\n$35 for a beautifully-cooked 10-oz prime rib with two sides is a good deal. You can't get anything comparable in that area at that quality for that price. \n\nBeing negative for the sake of being negative isn't the flex that you seem to think it is.",
            "author": "WelcomeToBrooklandia",
            "score": 0,
            "created_at": "2024-10-11T21:09:44.000Z",
            "parent_id": "t1_lrh0oja",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1fba/"
          },
          {
            "id": "t1_lrizy2a",
            "content": "I believe the original issue wasn’t the $35. It’s that the post is worded in a way that makes it seem you get all that for $19.",
            "author": "QuestoPresto",
            "score": 1,
            "created_at": "2024-10-12T05:45:23.000Z",
            "parent_id": "t1_lrh1fba",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrizy2a/"
          },
          {
            "id": "t1_lrjy99y",
            "content": "Yup.  The prime rib is cooked really well and they have the process dial down. I would recommend it to anyone who likes prime rib.  The service is also really good.",
            "author": "AutofillUserID",
            "score": 1,
            "created_at": "2024-10-12T12:04:00.000Z",
            "parent_id": "t1_lrizy2a",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjy99y/"
          },
          {
            "id": "t1_lrhpj8u",
            "content": "Best bang for your buck has to be Schlotzsky’s buy one get one free pizza on Wednesdays. Basically $5 per pizza. Cheaper than dominos",
            "author": "BigBoiBenisBlueBalls",
            "score": 6,
            "created_at": "2024-10-11T23:43:25.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhpj8u/"
          },
          {
            "id": "t1_lri0is1",
            "content": "I didn’t know about that, is that any location? Also, I’m literally still sad that they took away the pesto sauce, their new generic tomato sauce is such a bummer lol. ",
            "author": "Abysstreadr",
            "score": 2,
            "created_at": "2024-10-12T00:58:57.000Z",
            "parent_id": "t1_lrhpj8u",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri0is1/"
          },
          {
            "id": "t1_lri14zz",
            "content": "Yeah any location on Wednesday’s. Also $5 pizzas after 5pm Friday Saturday Sunday with is the same thing but I’m not sure how long that offer is good for. The Wednesday one is forever. Hmm I like it 🤔",
            "author": "BigBoiBenisBlueBalls",
            "score": 1,
            "created_at": "2024-10-12T01:03:16.000Z",
            "parent_id": "t1_lri0is1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri14zz/"
          },
          {
            "id": "t1_lrgyby5",
            "content": "You should have gone to Luby's instead.",
            "author": "Remarkable-Bid-7471",
            "score": 5,
            "created_at": "2024-10-11T20:51:48.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgyby5/"
          },
          {
            "id": "t1_lri78p5",
            "content": "This thread is a godsend!",
            "author": "BeerIsTheMindSpiller",
            "score": 4,
            "created_at": "2024-10-12T01:47:00.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri78p5/"
          },
          {
            "id": "t1_lrlg436",
            "content": "I’m jealous Dallas doesn’t have a sub for this.",
            "author": "Admirable_Basket381",
            "score": 2,
            "created_at": "2024-10-12T17:35:41.000Z",
            "parent_id": "t1_lri78p5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlg436/"
          },
          {
            "id": "t1_lrfom5l",
            "content": "that's where that motorcycle shop is/was?",
            "author": "leanmeanvagine",
            "score": 4,
            "created_at": "2024-10-11T16:40:19.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfom5l/"
          },
          {
            "id": "t1_lrfos4g",
            "content": "I guess I’m unfamiliar with that. It’s at the corner of Monroe and Congress",
            "author": "Street-Ask5154",
            "score": 4,
            "created_at": "2024-10-11T16:41:12.000Z",
            "parent_id": "t1_lrfom5l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfos4g/"
          },
          {
            "id": "t1_lrfy5b3",
            "content": "No its where Central Standard was",
            "author": "SecretHeroes",
            "score": 0,
            "created_at": "2024-10-11T17:31:27.000Z",
            "parent_id": "t1_lrfos4g",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy5b3/"
          },
          {
            "id": "t1_lrg4h8y",
            "content": "No. Across the little outdoor entrance area.",
            "author": "stevendaedelus",
            "score": 2,
            "created_at": "2024-10-11T18:05:35.000Z",
            "parent_id": "t1_lrfom5l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg4h8y/"
          },
          {
            "id": "t1_lrg7gmc",
            "content": "Ah yeah, that's what I meant.  I had a Monte Cristo there before...was pretty good.\n\nFor my mouth, that is, not my arteries.",
            "author": "leanmeanvagine",
            "score": 3,
            "created_at": "2024-10-11T18:21:58.000Z",
            "parent_id": "t1_lrg4h8y",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg7gmc/"
          },
          {
            "id": "t1_lrggeej",
            "content": "Yellow Rose prime rib",
            "author": "Bulk-of-the-Series",
            "score": 3,
            "created_at": "2024-10-11T19:11:13.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggeej/"
          },
          {
            "id": "t1_lrfygmz",
            "content": "Ya $35 as a “special” ain’t it 😂 and if it’s good, that’s the first thing that’s good at that spot",
            "author": "PristineDriver6485",
            "score": 3,
            "created_at": "2024-10-11T17:33:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfygmz/"
          },
          {
            "id": "t1_lrhowlg",
            "content": "This looks awful",
            "author": "iamjay92",
            "score": 2,
            "created_at": "2024-10-11T23:39:05.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhowlg/"
          },
          {
            "id": "t1_lrlrx5i",
            "content": "Took me way too long scrolling to find a comment saying this lol. That plate looks revolting asf",
            "author": "1Dzach",
            "score": 3,
            "created_at": "2024-10-12T18:40:30.000Z",
            "parent_id": "t1_lrhowlg",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlrx5i/"
          },
          {
            "id": "t1_lrhug9y",
            "content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
            "author": "milli_138",
            "score": 3,
            "created_at": "2024-10-12T00:17:11.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhug9y/"
          },
          {
            "id": "t1_lrifwa2",
            "content": "What's the last time you went? \n\nWe went about a year and a half ago and while they had a happy hour up on their website, they said they stopped doing that since covid and wound up spending $30 on some mediocre entrees and drinks that were 3X the price listed for that time online.\n\nHaven't bothered with it since, but the atmosphere seemed great and the employees were fantastic so we had a good time and made a mental note that it was more of a decent occasional date night place rather than the land of the killer happy-hour we had heard of.",
            "author": "Econolife-350",
            "score": 1,
            "created_at": "2024-10-12T02:49:11.000Z",
            "parent_id": "t1_lrhug9y",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrifwa2/"
          },
          {
            "id": "t1_lrivtjz",
            "content": "I’d have to look up what show it was for when we last went. I would guess within the past two months? You do have to sit at that cool bar way in the back. Not the one you can see when you enter.  I thought it was a rare amount of craftsmenship and once I learned the story of the bar I was really impressed with it, honestly.",
            "author": "milli_138",
            "score": 2,
            "created_at": "2024-10-12T05:04:17.000Z",
            "parent_id": "t1_lrifwa2",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrivtjz/"
          },
          {
            "id": "t1_lrirdbo",
            "content": "Long time Perry’s pork chop eater, first time poster. I am a HUGE steak person. I will admit, if I’m attending Perry’s on the company dime, I will usually order beef. HOWEVER until I tried the Perry’s pork chop I have never had a moist and tender pork dish. Man oh man did Perry’s prove my assumptions wrong. Their Friday special is not only a great deal but also delicious.",
            "author": "ObligationSquare6318",
            "score": 3,
            "created_at": "2024-10-12T04:23:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrirdbo/"
          },
          {
            "id": "t1_lrlahsu",
            "content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
            "author": "DrippingAgent",
            "score": 4,
            "created_at": "2024-10-12T17:05:13.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlahsu/"
          },
          {
            "id": "t1_lro6uqc",
            "content": "Bruh never had the Pork Chop friday special at Perrys.",
            "author": "Lobster_Donkey_36",
            "score": 3,
            "created_at": "2024-10-13T03:57:33.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lro6uqc/"
          },
          {
            "id": "t1_lrfu1bn",
            "content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
            "author": "Front-Statement-1636",
            "score": 1,
            "created_at": "2024-10-11T17:09:21.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfu1bn/"
          },
          {
            "id": "t1_lrg4mt9",
            "content": "What’s the pipe hit?",
            "author": "RoleModelsinBlood31",
            "score": 1,
            "created_at": "2024-10-11T18:06:25.000Z",
            "parent_id": "t1_lrfu1bn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg4mt9/"
          },
          {
            "id": "t1_lri4phi",
            "content": "Yo' mama",
            "author": "Flaky_Floor_6390",
            "score": 5,
            "created_at": "2024-10-12T01:28:47.000Z",
            "parent_id": "t1_lrg4mt9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4phi/"
          },
          {
            "id": "t1_lrg29zb",
            "content": "Are all the specials beef and pork chop related?",
            "author": "barrorg",
            "score": 2,
            "created_at": "2024-10-11T17:53:40.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg29zb/"
          },
          {
            "id": "t1_lrkhs0s",
            "content": "Palazzio’s men club first Friday of every month between 12-3 free prime rib included with $10 cover charge.",
            "author": "El_Sueno56",
            "score": 2,
            "created_at": "2024-10-12T14:20:41.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkhs0s/"
          },
          {
            "id": "t1_lrmhmjk",
            "content": "Is it good?",
            "author": "Street-Ask5154",
            "score": 1,
            "created_at": "2024-10-12T21:08:05.000Z",
            "parent_id": "t1_lrkhs0s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrmhmjk/"
          },
          {
            "id": "t1_lrz9nee",
            "content": "lol it’s edible but you get to look at nude tits",
            "author": "El_Sueno56",
            "score": 1,
            "created_at": "2024-10-15T02:30:45.000Z",
            "parent_id": "t1_lrmhmjk",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrz9nee/"
          },
          {
            "id": "t1_lrzbilb",
            "content": "Nothin better then nude tits",
            "author": "Street-Ask5154",
            "score": 1,
            "created_at": "2024-10-15T02:42:33.000Z",
            "parent_id": "t1_lrz9nee",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrzbilb/"
          },
          {
            "id": "t1_lrfvdnj",
            "content": "Josephine House’s steak night on Monday’s is fantastic",
            "author": "ptran90",
            "score": 1,
            "created_at": "2024-10-11T17:16:35.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfvdnj/"
          },
          {
            "id": "t1_lri5uyn",
            "content": "Comments like this make me so sad I can’t go out to dinner at the drop of a hat anymore bc of young children. Oh well. One day again.",
            "author": "leavinonajetplane7",
            "score": 3,
            "created_at": "2024-10-12T01:37:10.000Z",
            "parent_id": "t1_lrfvdnj",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri5uyn/"
          },
          {
            "id": "t1_lrlayen",
            "content": "Yes, it depends on the cut you get. It’s unlimited wine too haha unless they have changed it",
            "author": "ptran90",
            "score": 1,
            "created_at": "2024-10-12T17:07:44.000Z",
            "parent_id": "t1_lrk1zld",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlayen/"
          },
          {
            "id": "t1_lrhvymt",
            "content": "Yum 😋",
            "author": "MsMo999",
            "score": 1,
            "created_at": "2024-10-12T00:27:34.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhvymt/"
          },
          {
            "id": "t1_lrhwojq",
            "content": "Is Fennario Flats still playing that Friday lunch?",
            "author": "Sparkadelic007",
            "score": 1,
            "created_at": "2024-10-12T00:32:32.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhwojq/"
          },
          {
            "id": "t1_lria93g",
            "content": "Whats...uh..nuzzling..embracing? Supporting!  the questionable meat piece? Creamed spinach. Potato puree and something else I can't make out.",
            "author": "MongooseOk941",
            "score": 1,
            "created_at": "2024-10-12T02:08:36.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lria93g/"
          },
          {
            "id": "t1_lrkeaem",
            "content": "Horseradish",
            "author": "Coujelais",
            "score": 2,
            "created_at": "2024-10-12T13:58:53.000Z",
            "parent_id": "t1_lria93g",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkeaem/"
          },
          {
            "id": "t1_lrk5jkk",
            "content": "Tumble 22 happy hour sandwich + 1 side for ..$8?",
            "author": "masterbirder",
            "score": 1,
            "created_at": "2024-10-12T12:59:43.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk5jkk/"
          },
          {
            "id": "t1_lrlcqf1",
            "content": "super burrito on tuesdays ",
            "author": "Objective_Roof_8539",
            "score": 1,
            "created_at": "2024-10-12T17:17:24.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlcqf1/"
          },
          {
            "id": "t1_lrol3qk",
            "content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
            "author": "Money-Information-99",
            "score": 1,
            "created_at": "2024-10-13T06:07:01.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrol3qk/"
          },
          {
            "id": "t1_lrlg6dg",
            "content": "Man, I've never heard of this maies daies place. Gotta check-in out!",
            "author": "AffectionatePie8588",
            "score": 0,
            "created_at": "2024-10-12T17:36:02.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlg6dg/"
          },
          {
            "id": "t1_lrg2f0v",
            "content": "it looks like someone made a diaper out of a steak but I would still eat the shit out of that. It looks amazing",
            "author": "yourdadsboyfie",
            "score": 0,
            "created_at": "2024-10-11T17:54:25.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg2f0v/"
          },
          {
            "id": "t1_lrji7io",
            "content": "Hmm, my tired brain initially understood that as you'd eat the shit out of a diaper.\n\nYikes.",
            "author": "Stickyv35",
            "score": 2,
            "created_at": "2024-10-12T09:16:07.000Z",
            "parent_id": "t1_lrg2f0v",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrji7io/"
          },
          {
            "id": "t1_lrhqzd7",
            "content": "Awesome deal.  That’s almost the same cost as two Torchy’s tacos and a soda.",
            "author": "TX_spacegeek",
            "score": 0,
            "created_at": "2024-10-11T23:53:16.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhqzd7/"
          },
          {
            "id": "t1_lri89gm",
            "content": "Their mass produced tortillas in bulk are the absolute worst.  Gross",
            "author": "ganczha",
            "score": 4,
            "created_at": "2024-10-12T01:54:20.000Z",
            "parent_id": "t1_lrhqzd7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri89gm/"
          },
          {
            "id": "t1_lrif3u2",
            "content": "To be fair, as pictured it's $35 which I find funny they don't mention.",
            "author": "Econolife-350",
            "score": 3,
            "created_at": "2024-10-12T02:43:28.000Z",
            "parent_id": "t1_lrhqzd7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrif3u2/"
          },
          {
            "id": "t1_lri6vt6",
            "content": "Maie Day bitches",
            "author": "Gabby692024",
            "score": 0,
            "created_at": "2024-10-12T01:44:28.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6vt6/"
          },
          {
            "id": "t1_lriz3q0",
            "content": "Anything at Torchys",
            "author": "StoreRevolutionary70",
            "score": 0,
            "created_at": "2024-10-12T05:36:43.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lriz3q0/"
          },
          {
            "id": "t1_lri2sw8",
            "content": "That’s so raw 🤢",
            "author": "Doonesbury",
            "score": 0,
            "created_at": "2024-10-12T01:15:12.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri2sw8/"
          },
          {
            "id": "t1_lrjiad0",
            "content": "Well-done beef is best ordered at Golden Corral.",
            "author": "Stickyv35",
            "score": 1,
            "created_at": "2024-10-12T09:17:05.000Z",
            "parent_id": "t1_lri2sw8",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjiad0/"
          },
          {
            "id": "t1_lrk6bsu",
            "content": "It doesn’t have to be well done, just not raw, man.",
            "author": "Doonesbury",
            "score": 0,
            "created_at": "2024-10-12T13:05:17.000Z",
            "parent_id": "t1_lrjiad0",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk6bsu/"
          },
          {
            "id": "t1_lrkehty",
            "content": "Prime rib literally always looks like that",
            "author": "Coujelais",
            "score": 3,
            "created_at": "2024-10-12T14:00:15.000Z",
            "parent_id": "t1_lrk6bsu",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkehty/"
          },
          {
            "id": "t1_lrgz7bt",
            "content": "Why does everything in Texas come in a pool of beans",
            "author": "lateseasondad",
            "score": 0,
            "created_at": "2024-10-11T20:56:49.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgz7bt/"
          },
          {
            "id": "t1_lrh1oyd",
            "content": "That's au jus. No beans on that plate.",
            "author": "WelcomeToBrooklandia",
            "score": 11,
            "created_at": "2024-10-11T21:11:18.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1oyd/"
          },
          {
            "id": "t1_lrh6wis",
            "content": "What a moron 🤦🏻‍♀️😂",
            "author": "Wonderful-Distance51",
            "score": 0,
            "created_at": "2024-10-11T21:42:17.000Z",
            "parent_id": "t1_lrh1oyd",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh6wis/"
          },
          {
            "id": "t1_lrhvzbi",
            "content": "1.) Beans are delicious \n\n\n2.) Ain't beans",
            "author": "cflatjazz",
            "score": 6,
            "created_at": "2024-10-12T00:27:41.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhvzbi/"
          },
          {
            "id": "t1_lri69xv",
            "content": "I too thought it was refried beans, as I’ve never had prime rib.",
            "author": "leavinonajetplane7",
            "score": 1,
            "created_at": "2024-10-12T01:40:08.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri69xv/"
          },
          {
            "id": "t1_lrt9eqh",
            "content": "lolol thought this was a troll post til I read the other comments.",
            "author": "FakeEmpire20",
            "score": 1,
            "created_at": "2024-10-14T01:28:25.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrt9eqh/"
          }
        ]
      }
    ]
  },
  "chunkedInputs": [
    {
      "chunkIndex": 0,
      "chunkId": "chunk_t1_lrfp6ta",
      "commentCount": 29,
      "rootCommentScore": 262,
      "extractFromPost": true,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfp6ta",
            "content": "Not sure that's better than Perry's Friday pork chop lunch special.",
            "author": "Tweedle_DeeDum",
            "score": 262,
            "created_at": "2024-10-11T16:43:23.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6ta/"
          },
          {
            "id": "t1_lrgauhf",
            "content": "Brother, we’re talking about pork and prime rib here. Are you serious?",
            "author": "wulfgyang",
            "score": 22,
            "created_at": "2024-10-11T18:40:33.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgauhf/"
          },
          {
            "id": "t1_lrgb9lo",
            "content": "It's a real big pork chop.",
            "author": "Odd_Bodkin",
            "score": 86,
            "created_at": "2024-10-11T18:42:49.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgb9lo/"
          },
          {
            "id": "t1_lrge5sz",
            "content": "I’ve had it, I’ll say it’s good. But that’s prime rib on his plate for the same price.",
            "author": "wulfgyang",
            "score": 18,
            "created_at": "2024-10-11T18:58:45.000Z",
            "parent_id": "t1_lrgb9lo",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrge5sz/"
          },
          {
            "id": "t1_lrggn7s",
            "content": "Well, the plate shown by OP is actually $35 but then the sides at Perry's are not cheap either.  \n\nThe Perry chop is 1.5lbs and includes mashed potatoes and apple sauce.  My experience is that you either split it with someone or have a second meal of leftovers.\n\nThey will split it for you when you order if you ask.",
            "author": "Tweedle_DeeDum",
            "score": 38,
            "created_at": "2024-10-11T19:12:35.000Z",
            "parent_id": "t1_lrge5sz",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggn7s/"
          },
          {
            "id": "t1_lrhlb83",
            "content": "Worst part about it is that it’s on Friday, and every I’d leave it in the fridge at work and forget it every damn time",
            "author": "skratsda",
            "score": 5,
            "created_at": "2024-10-11T23:14:53.000Z",
            "parent_id": "t1_lrggn7s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhlb83/"
          },
          {
            "id": "t1_lrhujz5",
            "content": "You're not supposed to go back to work after Friday pork chop lunch at Perry's",
            "author": "quirino254",
            "score": 44,
            "created_at": "2024-10-12T00:17:53.000Z",
            "parent_id": "t1_lrhlb83",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhujz5/"
          },
          {
            "id": "t1_lrgj2dr",
            "content": "Have you had the pork chop being referenced? This isn’t like a Sam’s club special pork chop…",
            "author": "pbagwell84",
            "score": 13,
            "created_at": "2024-10-11T19:26:12.000Z",
            "parent_id": "t1_lrge5sz",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgj2dr/"
          },
          {
            "id": "t1_lrk2fx9",
            "content": "They smoked their pork chop for 4 to 6 hours. Then they see it with a brown sugar like rub.  The darker it is more tender it is. Like many have said it can be dry sometimes if it hasn’t been smoked for long enough, but it still an excellent deal. \nI know the domain location gets slammed where they have to serve over 1000 pork chops on Friday during lunch  so the consistency may not be as tender as dinner time.",
            "author": "AutofillUserID",
            "score": 2,
            "created_at": "2024-10-12T12:37:03.000Z",
            "parent_id": "t1_lrgj2dr",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk2fx9/"
          },
          {
            "id": "t1_lrkfsw9",
            "content": "Interesting. I didn’t know how it was prepared, just that it is delicious. I love the three different sections, as they do feel like 3 completely different pieces of meat, all served on one plate. Naturally, my first time having it was the best and other times it hasn’t been quite as good, but always very tasty and the deal on Friday is just a bonus.",
            "author": "pbagwell84",
            "score": 1,
            "created_at": "2024-10-12T14:08:32.000Z",
            "parent_id": "t1_lrk2fx9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkfsw9/"
          },
          {
            "id": "t1_lrnpdao",
            "content": "Prime rib is gross",
            "author": "[deleted]",
            "score": 1,
            "created_at": "2024-10-13T01:51:36.000Z",
            "parent_id": "t1_lrge5sz",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrnpdao/"
          },
          {
            "id": "t1_lrhldza",
            "content": "I don’t know if you’ve had it but it’s a REALLY good pork chop. Never had anything like it.",
            "author": "KendrickBlack502",
            "score": 6,
            "created_at": "2024-10-11T23:15:24.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhldza/"
          },
          {
            "id": "t1_lrjzosz",
            "content": "Prime rib is garbage",
            "author": "Longhorn24",
            "score": 1,
            "created_at": "2024-10-12T12:15:32.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjzosz/"
          },
          {
            "id": "t1_lrkkbdj",
            "content": "No question. Pork over beef all day.",
            "author": "Yooooooooooo0o",
            "score": 1,
            "created_at": "2024-10-12T14:35:54.000Z",
            "parent_id": "t1_lrgauhf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkkbdj/"
          },
          {
            "id": "t1_lrig5px",
            "content": "Perry's pork chop is incredible. Add in the applesauce snf fuck yes.",
            "author": "crabby-owlbear",
            "score": 10,
            "created_at": "2024-10-12T02:51:08.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrig5px/"
          },
          {
            "id": "t1_lrgu3kx",
            "content": "Honestly tell me what's so great about Perry's? I've only been once, two of us ate and the bill was over $200 not including tip. The pork chop was tough, the ribeye steak was just okay and the sides were forgettable. I will say it was the Domain location and I've only been once but I was super unimpressed.  It's just not worth the price.",
            "author": "AnnieB512",
            "score": 2,
            "created_at": "2024-10-11T20:28:02.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgu3kx/"
          },
          {
            "id": "t1_lrifho4",
            "content": "Huge difference between the Domain and downtown location in my experience. Been a few years since I was last there but the downtown location I've eaten a few times and had good experiences each time. The Domain location was terrible for me",
            "author": "tzejin",
            "score": 6,
            "created_at": "2024-10-12T02:46:13.000Z",
            "parent_id": "t1_lrgu3kx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrifho4/"
          },
          {
            "id": "t1_lrjgas7",
            "content": "I've had the pork chop over a dozen times at three different locations across Texas. Never once was it tough.\n\nNormally, Perry's is an expensive place. I mean, they charge $14 for a house Caesar salad! However, the Friday pork chop special is just that, damn special! If you can refrain from ordering apps, cocktails, starter salads, and dessert, a $20 meal that could easily be split into two portions is a big win in 2024.",
            "author": "Stickyv35",
            "score": 3,
            "created_at": "2024-10-12T08:53:00.000Z",
            "parent_id": "t1_lrgu3kx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjgas7/"
          },
          {
            "id": "t1_lrjx7hn",
            "content": "And they serve shriveled up hamburgers that are 2 inches too small for the bun.",
            "author": "finger_foodie",
            "score": 2,
            "created_at": "2024-10-12T11:55:16.000Z",
            "parent_id": "t1_lrgu3kx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjx7hn/"
          },
          {
            "id": "t1_lri4mc9",
            "content": "Both excellent, can't compare prime rib vs porkchop though.",
            "author": "ac_slat3r",
            "score": 1,
            "created_at": "2024-10-12T01:28:09.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4mc9/"
          },
          {
            "id": "t1_lrj5ndp",
            "content": "Perry's pork chop is half the size it used to be.  And it used to be great, like pre 2012, it's a far cry from what it used to be.  My last few visits there have been horrible.  Dried overcooked and salty small pork chop, haven't been back since 2021.",
            "author": "elibutton",
            "score": 0,
            "created_at": "2024-10-12T06:47:14.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj5ndp/"
          },
          {
            "id": "t1_lrk3ji8",
            "content": "Back in the day, I think the $12 lunch chop was the same 3-4 bone 32oz chop they serve at dinner. Now it is a 2 bone 18oz chop that goes for $19. So definitely not the deal it used to be.\n\nI don't think that it is small in absolute terms but certainly smaller than it used to be.\n\nThe big loss for me was when they stopped carving it table side.",
            "author": "Tweedle_DeeDum",
            "score": 2,
            "created_at": "2024-10-12T12:45:16.000Z",
            "parent_id": "t1_lrj5ndp",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk3ji8/"
          },
          {
            "id": "t1_lrgmrdq",
            "content": "Yeah, we get it, it's a great pork chop and good deal.\n\nBut how many times are you gonna post about it here?\n\nAre you a Perry's employee???",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T19:47:05.000Z",
            "parent_id": "t1_lrfp6ta",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgmrdq/"
          },
          {
            "id": "t1_lrh0eik",
            "content": "I think I was just participating in a conversation, in an agreeable and polite manner.\n\nYou should try it.\n\nNot affiliated with Perry's.",
            "author": "Tweedle_DeeDum",
            "score": 14,
            "created_at": "2024-10-11T21:03:46.000Z",
            "parent_id": "t1_lrgmrdq",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh0eik/"
          },
          {
            "id": "t1_lrh15ru",
            "content": "&gt;I think I was just participating in a conversation\n\nWhich you keep doing over and over and over in this sub about their pork chop.\n\nWe all already know it's a good pork chop, Perry's employee.",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T21:08:12.000Z",
            "parent_id": "t1_lrh0eik",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh15ru/"
          },
          {
            "id": "t1_lrh1vl5",
            "content": "Can you guys just go on a date already.\n\n\nI recommend Perry's ",
            "author": "z64_dan",
            "score": 18,
            "created_at": "2024-10-11T21:12:22.000Z",
            "parent_id": "t1_lrh15ru",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1vl5/"
          },
          {
            "id": "t1_lrh5hr1",
            "content": "I've heard their pork chop is pretty good.",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T21:33:47.000Z",
            "parent_id": "t1_lrh1vl5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh5hr1/"
          },
          {
            "id": "t1_lrh3amy",
            "content": "I'll post what I like and when I like, Karen.  But this conversation is clearly not value-added so feel free to have the last word.",
            "author": "Tweedle_DeeDum",
            "score": 11,
            "created_at": "2024-10-11T21:20:38.000Z",
            "parent_id": "t1_lrh15ru",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh3amy/"
          },
          {
            "id": "t1_lrh5ryd",
            "content": "No u.",
            "author": "kanyeguisada",
            "score": 0,
            "created_at": "2024-10-11T21:35:28.000Z",
            "parent_id": "t1_lrh3amy",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh5ryd/"
          }
        ],
        "extract_from_post": true
      }
    },
    {
      "chunkIndex": 1,
      "chunkId": "chunk_t1_lrfp6g7",
      "commentCount": 8,
      "rootCommentScore": 110,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfp6g7",
            "content": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
            "author": "WelcomeToBrooklandia",
            "score": 110,
            "created_at": "2024-10-11T16:43:20.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6g7/"
          },
          {
            "id": "t1_lrg0vke",
            "content": "Habanero lunch special prices make you feel like you time traveled back to 2011.",
            "author": "austinoracle",
            "score": 34,
            "created_at": "2024-10-11T17:46:14.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0vke/"
          },
          {
            "id": "t1_lrg5lml",
            "content": "Beef fajita ranchera plate is king of the lunch specials for me. 🫶🏼",
            "author": "Coujelais",
            "score": 12,
            "created_at": "2024-10-11T18:11:40.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg5lml/"
          },
          {
            "id": "t1_lri4iq4",
            "content": "I love that little spot.",
            "author": "starillin",
            "score": 2,
            "created_at": "2024-10-12T01:27:28.000Z",
            "parent_id": "t1_lrg5lml",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4iq4/"
          },
          {
            "id": "t1_lri4y07",
            "content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥️♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
            "author": "Coujelais",
            "score": 5,
            "created_at": "2024-10-12T01:30:30.000Z",
            "parent_id": "t1_lri4iq4",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/"
          },
          {
            "id": "t1_lri1173",
            "content": "Chilakillers gigantic burrito plate for 6.99. Nuff said",
            "author": "ChickonKiller",
            "score": 6,
            "created_at": "2024-10-12T01:02:31.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri1173/"
          },
          {
            "id": "t1_lrfzeat",
            "content": "Prime rib is a roast, not a steak.",
            "author": "sqweak",
            "score": 0,
            "created_at": "2024-10-11T17:38:16.000Z",
            "parent_id": "t1_lrfp6g7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfzeat/"
          },
          {
            "id": "t1_lrg0ihy",
            "content": "OK? My point still stands. \n\n\"You're still getting an excellent BEEF meal for $35.\" Feel better now?",
            "author": "WelcomeToBrooklandia",
            "score": 27,
            "created_at": "2024-10-11T17:44:17.000Z",
            "parent_id": "t1_lrfzeat",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0ihy/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 2,
      "chunkId": "chunk_t1_lrfuod7",
      "commentCount": 14,
      "rootCommentScore": 84,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfuod7",
            "content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
            "author": "genteelbartender",
            "score": 84,
            "created_at": "2024-10-11T17:12:47.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfuod7/"
          },
          {
            "id": "t1_lrg46x1",
            "content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
            "author": "RoleModelsinBlood31",
            "score": 33,
            "created_at": "2024-10-11T18:04:03.000Z",
            "parent_id": "t1_lrfuod7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg46x1/"
          },
          {
            "id": "t1_lrg62bj",
            "content": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
            "author": "genteelbartender",
            "score": 10,
            "created_at": "2024-10-11T18:14:14.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg62bj/"
          },
          {
            "id": "t1_lrg7x0s",
            "content": "Yep, they’re pretty consistent, and busy as hell.  I really don’t think I’ve ever been there when it’s not packed all times of the day.  Just reminds me of all the fairly priced places from the 90’s that didn’t knock your socks off or did anything mind blowing but they were always consistent and had good food",
            "author": "RoleModelsinBlood31",
            "score": 14,
            "created_at": "2024-10-11T18:24:26.000Z",
            "parent_id": "t1_lrg62bj",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg7x0s/"
          },
          {
            "id": "t1_lrjh8q0",
            "content": "100%. It feels nostalgic, which post-Covid is a welcomed feeling! It's the go-to in the budget category for us.\n\nYou're making me want to buy some shares, too!",
            "author": "Stickyv35",
            "score": 3,
            "created_at": "2024-10-12T09:04:21.000Z",
            "parent_id": "t1_lrg7x0s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjh8q0/"
          },
          {
            "id": "t1_lrg82ss",
            "content": "Tx Roadhouse is basically the new Lubys.",
            "author": "genteelbartender",
            "score": 1,
            "created_at": "2024-10-11T18:25:18.000Z",
            "parent_id": "t1_lrg7x0s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg82ss/"
          },
          {
            "id": "t1_lrgidu1",
            "content": "comparing a place that offers steaks and whatnot to a place that is cafeteria food is wild.",
            "author": "__vheissu__",
            "score": 4,
            "created_at": "2024-10-11T19:22:19.000Z",
            "parent_id": "t1_lrg82ss",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgidu1/"
          },
          {
            "id": "t1_lrgj393",
            "content": "You clearly never went to Lubys in its heyday. Lubys is country food, just like Texas Roadhouse. But also, I challenge you to go to each place around 4pm and tell me it’s not the same demo.",
            "author": "genteelbartender",
            "score": 12,
            "created_at": "2024-10-11T19:26:20.000Z",
            "parent_id": "t1_lrgidu1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgj393/"
          },
          {
            "id": "t1_lrgj84g",
            "content": "I’m not 80 years old, I didnt get to experience their “heyday”.",
            "author": "__vheissu__",
            "score": 0,
            "created_at": "2024-10-11T19:27:06.000Z",
            "parent_id": "t1_lrgj393",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgj84g/"
          },
          {
            "id": "t1_lrjhgtc",
            "content": "Neither am I. But I do remember Luby's being fantastic in the late 90's, early 2000's. It started to change around the 2010's IMO.",
            "author": "Stickyv35",
            "score": 2,
            "created_at": "2024-10-12T09:07:04.000Z",
            "parent_id": "t1_lrgj84g",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjhgtc/"
          },
          {
            "id": "t1_lrg63c6",
            "content": "I went recently for a work thing and was very pleasantly surprised.  I’ve been trying to spread the word since.",
            "author": "genteelbartender",
            "score": 2,
            "created_at": "2024-10-11T18:14:23.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg63c6/"
          },
          {
            "id": "t1_lrg81yv",
            "content": "I went bc i was on a road trip. It's pretty middling quality. Rolls are great.",
            "author": "OhYerSoKew",
            "score": 2,
            "created_at": "2024-10-11T18:25:11.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg81yv/"
          },
          {
            "id": "t1_lrjh0n4",
            "content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
            "author": "Stickyv35",
            "score": 1,
            "created_at": "2024-10-12T09:01:38.000Z",
            "parent_id": "t1_lrg46x1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjh0n4/"
          },
          {
            "id": "t1_lrgm3rj",
            "content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
            "author": "slamminsalmoncannon",
            "score": 8,
            "created_at": "2024-10-11T19:43:26.000Z",
            "parent_id": "t1_lrfuod7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgm3rj/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 3,
      "chunkId": "chunk_t1_lrg1s92",
      "commentCount": 3,
      "rootCommentScore": 32,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrg1s92",
            "content": "Jack Allen’s happy hour is half off apps. You can get literally every app, like 8 different ones, for like $50. It’s a ton of food and a great deal.",
            "author": "IAmSportikus",
            "score": 32,
            "created_at": "2024-10-11T17:51:04.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1s92/"
          },
          {
            "id": "t1_lrj153e",
            "content": "Fonda San Miguel used to do this. Was an awesome deal.",
            "author": "genteelbartender",
            "score": 5,
            "created_at": "2024-10-12T05:57:48.000Z",
            "parent_id": "t1_lrg1s92",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj153e/"
          },
          {
            "id": "t1_lrkdfp1",
            "content": "What happened to JA? Went to the oak hill one like always last month and it was terrible. Seemed like a change in food supply, chicken was smaller dry pieces, gravy and CFS sucked. Was embarrassed I took some visiting family there.",
            "author": "macgrubersir",
            "score": 0,
            "created_at": "2024-10-12T13:53:23.000Z",
            "parent_id": "t1_lrg1s92",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkdfp1/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 4,
      "chunkId": "chunk_t1_lrfthzm",
      "commentCount": 5,
      "rootCommentScore": 27,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfthzm",
            "content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
            "author": "longhorn_2017",
            "score": 27,
            "created_at": "2024-10-11T17:06:26.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfthzm/"
          },
          {
            "id": "t1_lrfxhh3",
            "content": "Is the prime rib/potato deal also on the lunch menu?",
            "author": "megaphoneXX",
            "score": 3,
            "created_at": "2024-10-11T17:27:52.000Z",
            "parent_id": "t1_lrfthzm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfxhh3/"
          },
          {
            "id": "t1_lrfz7kn",
            "content": "I believe it's only on the lunch menu!",
            "author": "longhorn_2017",
            "score": 2,
            "created_at": "2024-10-11T17:37:14.000Z",
            "parent_id": "t1_lrfxhh3",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfz7kn/"
          },
          {
            "id": "t1_lrgfw54",
            "content": "is that only Fridays?",
            "author": "FakeEmpire20",
            "score": 2,
            "created_at": "2024-10-11T19:08:23.000Z",
            "parent_id": "t1_lrfthzm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgfw54/"
          },
          {
            "id": "t1_lrghyvm",
            "content": "Yes, they're only open for lunch on Friday.",
            "author": "longhorn_2017",
            "score": 3,
            "created_at": "2024-10-11T19:19:59.000Z",
            "parent_id": "t1_lrgfw54",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrghyvm/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 5,
      "chunkId": "chunk_t1_lrfqypm",
      "commentCount": 3,
      "rootCommentScore": 27,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfqypm",
            "content": "HUGE pork-chop at Perry’s in domain or 7th Street is the best special \nback in my day, price was about $14… now it’s up to $19… Rambles about inflation 😝",
            "author": "Beneficial-Stable-66",
            "score": 27,
            "created_at": "2024-10-11T16:52:49.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfqypm/"
          },
          {
            "id": "t1_lri5neu",
            "content": "I remember having it when it was $11. If it was never $11, then I don’t know what I remember. I’m old. But even as a person who doesn’t generally like pork, it actually is quite good.",
            "author": "leavinonajetplane7",
            "score": 2,
            "created_at": "2024-10-12T01:35:39.000Z",
            "parent_id": "t1_lrfqypm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri5neu/"
          },
          {
            "id": "t1_lrjhtmt",
            "content": "In before that one guy drop by bitching that you're a Perry's employee or something! 🤣",
            "author": "Stickyv35",
            "score": 2,
            "created_at": "2024-10-12T09:11:24.000Z",
            "parent_id": "t1_lrfqypm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjhtmt/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 6,
      "chunkId": "chunk_t1_lrgn98r",
      "commentCount": 3,
      "rootCommentScore": 25,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrgn98r",
            "content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
            "author": "kanyeguisada",
            "score": 25,
            "created_at": "2024-10-11T19:49:51.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgn98r/"
          },
          {
            "id": "t1_lrj1e65",
            "content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
            "author": "modernmovements",
            "score": 3,
            "created_at": "2024-10-12T06:00:26.000Z",
            "parent_id": "t1_lrgn98r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj1e65/"
          },
          {
            "id": "t1_lrip6oa",
            "content": "Interesting",
            "author": "Arty_Puls",
            "score": 2,
            "created_at": "2024-10-12T04:03:48.000Z",
            "parent_id": "t1_lrgn98r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrip6oa/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 7,
      "chunkId": "chunk_t1_lrgdaji",
      "commentCount": 5,
      "rootCommentScore": 24,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrgdaji",
            "content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
            "author": "Open-EyedTraveler",
            "score": 24,
            "created_at": "2024-10-11T18:53:59.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgdaji/"
          },
          {
            "id": "t1_lrgipxt",
            "content": "Not sure why you're getting downvoted- $20 for an old-fashioned and a burger is a good deal!",
            "author": "WelcomeToBrooklandia",
            "score": 12,
            "created_at": "2024-10-11T19:24:14.000Z",
            "parent_id": "t1_lrgdaji",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgipxt/"
          },
          {
            "id": "t1_lrlwx6z",
            "content": "Haha ty- I think so too! if you live in Austin, you’re paying $14-$16 dollars for a high-quality old fashioned at a restaurant. The burger is filling and high quality and they don’t skimp on the fries. I say it’s a steal in my book.",
            "author": "Open-EyedTraveler",
            "score": 1,
            "created_at": "2024-10-12T19:08:13.000Z",
            "parent_id": "t1_lrgipxt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlwx6z/"
          },
          {
            "id": "t1_lrij949",
            "content": "Happy hour in general is great there. Had a half dozen oysters, shrimp cocktails, mussels, fries, Caesar salad two cocktails and a bottle of wine for $100 today",
            "author": "laffs4jeffy",
            "score": 7,
            "created_at": "2024-10-12T03:15:03.000Z",
            "parent_id": "t1_lrgdaji",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrij949/"
          },
          {
            "id": "t1_lrt967k",
            "content": "They also do a steak night on Sundays! Love Hillside.",
            "author": "FakeEmpire20",
            "score": 1,
            "created_at": "2024-10-14T01:26:49.000Z",
            "parent_id": "t1_lrgdaji",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrt967k/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 8,
      "chunkId": "chunk_t1_lrfryrh",
      "commentCount": 13,
      "rootCommentScore": 20,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfryrh",
            "content": "Polazios 1st Friday’s $10 prime rib.",
            "author": "LongShotLives",
            "score": 20,
            "created_at": "2024-10-11T16:58:08.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfryrh/"
          },
          {
            "id": "t1_lrgd76l",
            "content": "The strip club?",
            "author": "[deleted]",
            "score": 6,
            "created_at": "2024-10-11T18:53:28.000Z",
            "parent_id": "t1_lrfryrh",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgd76l/"
          },
          {
            "id": "t1_lrgg7ey",
            "content": "Yes",
            "author": "LongShotLives",
            "score": 7,
            "created_at": "2024-10-11T19:10:07.000Z",
            "parent_id": "t1_lrgd76l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgg7ey/"
          },
          {
            "id": "t1_lrhj4rv",
            "content": "Do I have to pay to enter the club? Or can I just go in, eat my meat and leave ?",
            "author": "PrizeNo2127",
            "score": 4,
            "created_at": "2024-10-11T23:00:24.000Z",
            "parent_id": "t1_lrfryrh",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhj4rv/"
          },
          {
            "id": "t1_lrhlwb5",
            "content": "Yeah. Go in and eat and leave. No one is going to keep you there. No 2 drink minimum if that’s what you are worried about.",
            "author": "LongShotLives",
            "score": 4,
            "created_at": "2024-10-11T23:18:48.000Z",
            "parent_id": "t1_lrhj4rv",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhlwb5/"
          },
          {
            "id": "t1_lri23ih",
            "content": "I was worried I would have to buy a lap dance too",
            "author": "PrizeNo2127",
            "score": 5,
            "created_at": "2024-10-12T01:10:08.000Z",
            "parent_id": "t1_lrhlwb5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri23ih/"
          },
          {
            "id": "t1_lri6mkd",
            "content": "That’s up to you friendo 😉",
            "author": "LongShotLives",
            "score": 5,
            "created_at": "2024-10-12T01:42:40.000Z",
            "parent_id": "t1_lri23ih",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6mkd/"
          },
          {
            "id": "t1_lrwczkm",
            "content": "\\*beat",
            "author": "red_ocean5",
            "score": 1,
            "created_at": "2024-10-14T16:37:04.000Z",
            "parent_id": "t1_lrhj4rv",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrwczkm/"
          },
          {
            "id": "t1_lrgk608",
            "content": "Be honest , you don’t go to polazios because of the prime rib.",
            "author": "pompom_waver",
            "score": 2,
            "created_at": "2024-10-11T19:32:27.000Z",
            "parent_id": "t1_lrfryrh",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgk608/"
          },
          {
            "id": "t1_lrgmzdw",
            "content": "Prime rib with a view😎",
            "author": "LongShotLives",
            "score": 11,
            "created_at": "2024-10-11T19:48:20.000Z",
            "parent_id": "t1_lrgk608",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgmzdw/"
          },
          {
            "id": "t1_lrgxidm",
            "content": "Steak &amp; Leggs",
            "author": "PristineDriver6485",
            "score": 15,
            "created_at": "2024-10-11T20:47:07.000Z",
            "parent_id": "t1_lrgmzdw",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgxidm/"
          },
          {
            "id": "t1_lrgy5yh",
            "content": "I like yo style my friend. 🤘🏽",
            "author": "LongShotLives",
            "score": 5,
            "created_at": "2024-10-11T20:50:51.000Z",
            "parent_id": "t1_lrgxidm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgy5yh/"
          },
          {
            "id": "t1_lri3zqp",
            "content": "Tits 'n' Taters",
            "author": "Flaky_Floor_6390",
            "score": 6,
            "created_at": "2024-10-12T01:23:39.000Z",
            "parent_id": "t1_lrgxidm",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri3zqp/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 9,
      "chunkId": "chunk_t1_lrfq0jn",
      "commentCount": 8,
      "rootCommentScore": 18,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfq0jn",
            "content": "Carve lunch deal rivals it. \n\nBut a prime rib like my dad ate..",
            "author": "IdeaJason",
            "score": 18,
            "created_at": "2024-10-11T16:47:47.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfq0jn/"
          },
          {
            "id": "t1_lrfqw49",
            "content": "Whats this deal?",
            "author": "Street-Ask5154",
            "score": 3,
            "created_at": "2024-10-11T16:52:27.000Z",
            "parent_id": "t1_lrfq0jn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfqw49/"
          },
          {
            "id": "t1_lrfsm6j",
            "content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
            "author": "IdeaJason",
            "score": 21,
            "created_at": "2024-10-11T17:01:37.000Z",
            "parent_id": "t1_lrfqw49",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfsm6j/"
          },
          {
            "id": "t1_lrfzqe7",
            "content": "This has been my go to Friday lunch for a while. IMO it’s the best steak special in town.",
            "author": "sqweak",
            "score": 1,
            "created_at": "2024-10-11T17:40:05.000Z",
            "parent_id": "t1_lrfsm6j",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfzqe7/"
          },
          {
            "id": "t1_lrg090q",
            "content": "And quite possibly the finest cut of meat for the price I've ever encountered.",
            "author": "IdeaJason",
            "score": 2,
            "created_at": "2024-10-11T17:42:51.000Z",
            "parent_id": "t1_lrfzqe7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg090q/"
          },
          {
            "id": "t1_lrh8960",
            "content": "How is the smokiness of that New York strip? Sounds really good. \n\nEdit: Never had a smoked steak!",
            "author": "ActionPerkins",
            "score": 1,
            "created_at": "2024-10-11T21:50:33.000Z",
            "parent_id": "t1_lrg090q",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh8960/"
          },
          {
            "id": "t1_lrfsnb8",
            "content": "From the website: Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19 every Friday (11am to 5pm)",
            "author": "MilesandOz",
            "score": 6,
            "created_at": "2024-10-11T17:01:47.000Z",
            "parent_id": "t1_lrfqw49",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfsnb8/"
          },
          {
            "id": "t1_lu3s7qg",
            "content": "Yup this is the move ",
            "author": "melvinmayhem1337",
            "score": 2,
            "created_at": "2024-10-28T00:58:50.000Z",
            "parent_id": "t1_lrfq0jn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lu3s7qg/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 10,
      "chunkId": "chunk_t1_lrfy5gn",
      "commentCount": 2,
      "rootCommentScore": 18,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfy5gn",
            "content": "Free prime rib at palazio. Every first Friday.",
            "author": "PristineDriver6485",
            "score": 18,
            "created_at": "2024-10-11T17:31:29.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy5gn/"
          },
          {
            "id": "t1_lrhref5",
            "content": "You not gonna walk out of there spending less than $19.  LOL",
            "author": "TX_spacegeek",
            "score": 10,
            "created_at": "2024-10-11T23:56:08.000Z",
            "parent_id": "t1_lrfy5gn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhref5/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 11,
      "chunkId": "chunk_t1_lrge61r",
      "commentCount": 3,
      "rootCommentScore": 16,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrge61r",
            "content": "This looks like the food we give patients with swallowing issues, in the hospital.  😬",
            "author": "lawlislr",
            "score": 16,
            "created_at": "2024-10-11T18:58:47.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrge61r/"
          },
          {
            "id": "t1_lrie17a",
            "content": "And as pictured I think it's $35 where their wording seems purposefully obtuse to make it seem as if it's actually $19.",
            "author": "Econolife-350",
            "score": 8,
            "created_at": "2024-10-12T02:35:59.000Z",
            "parent_id": "t1_lrge61r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrie17a/"
          },
          {
            "id": "t1_lrkdwwk",
            "content": "Prime rib for swallowing issues lolol",
            "author": "Coujelais",
            "score": 2,
            "created_at": "2024-10-12T13:56:30.000Z",
            "parent_id": "t1_lrge61r",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkdwwk/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 12,
      "chunkId": "chunk_t1_lrfm0kg",
      "commentCount": 1,
      "rootCommentScore": 12,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfm0kg",
            "content": "Damn that is a good deal I really wish I wasn't working today",
            "author": "titos334",
            "score": 12,
            "created_at": "2024-10-11T16:26:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfm0kg/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 13,
      "chunkId": "chunk_t1_lrfswd5",
      "commentCount": 6,
      "rootCommentScore": 11,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfswd5",
            "content": "What does \"both sides\" mean? What does \"opt in\" mean?\n\nWhat do you mean by \"otherwise\" I'm so confused lol",
            "author": "EbagI",
            "score": 11,
            "created_at": "2024-10-11T17:03:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfswd5/"
          },
          {
            "id": "t1_lrft9jt",
            "content": "The prime rib is 19$. The potatoes and creamed kale are sides. You can may 8$ for each of them. Otherwise would mean you didn’t add them.",
            "author": "Street-Ask5154",
            "score": 4,
            "created_at": "2024-10-11T17:05:10.000Z",
            "parent_id": "t1_lrfswd5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrft9jt/"
          },
          {
            "id": "t1_lrftnb9",
            "content": "Jesus Christ, I completely did not understand \"sides\" as in, side dishes 😂 \n\nCompletely me being an idiot. I have no idea why I did not understand that, thank you so much for spelling it out ❤️ thank you for the post in general",
            "author": "EbagI",
            "score": 21,
            "created_at": "2024-10-11T17:07:14.000Z",
            "parent_id": "t1_lrft9jt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrftnb9/"
          },
          {
            "id": "t1_lrfwgmw",
            "content": "You are not alone. For some reason I was confused by the wording as well. I thought both sides referred to the restaurant having two entrances or something lol, or both sides of the beef maybe?",
            "author": "funkmastamatt",
            "score": 9,
            "created_at": "2024-10-11T17:22:24.000Z",
            "parent_id": "t1_lrftnb9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfwgmw/"
          },
          {
            "id": "t1_lrgaqkb",
            "content": "Me three..  At first I thought OP meant both sides of the prime rib.  Lol.",
            "author": "llamawc77",
            "score": 3,
            "created_at": "2024-10-11T18:39:56.000Z",
            "parent_id": "t1_lrfwgmw",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgaqkb/"
          },
          {
            "id": "t1_lrh3e4s",
            "content": "I initially read that as both sides of the prime rib are terrific 😂",
            "author": "trainwreckchococat",
            "score": 3,
            "created_at": "2024-10-11T21:21:12.000Z",
            "parent_id": "t1_lrftnb9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh3e4s/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 14,
      "chunkId": "chunk_t1_lrg0qtx",
      "commentCount": 6,
      "rootCommentScore": 10,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrg0qtx",
            "content": "Op forgot to mention they charge an arm and a leg for the sides.  The prime rib special is just that.  \nAs shown I think it’s a 30-35 dollar plate. So he’ll no. I went there once.",
            "author": "AutofillUserID",
            "score": 10,
            "created_at": "2024-10-11T17:45:32.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0qtx/"
          },
          {
            "id": "t1_lrg1ccu",
            "content": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
            "author": "WelcomeToBrooklandia",
            "score": 4,
            "created_at": "2024-10-11T17:48:44.000Z",
            "parent_id": "t1_lrg0qtx",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1ccu/"
          },
          {
            "id": "t1_lrh0oja",
            "content": "Not really a deal at $35.  It’s ok normal pricing for the location. The Perry Friday special is mad popular.  \nMaie Day is just not busy with their special that’s been there for a long time.",
            "author": "AutofillUserID",
            "score": 6,
            "created_at": "2024-10-11T21:05:24.000Z",
            "parent_id": "t1_lrg1ccu",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh0oja/"
          },
          {
            "id": "t1_lrh1fba",
            "content": "Perry's has been around a lot longer than Maie Day. Makes sense that their special is more popular/well-known. \n\n$35 for a beautifully-cooked 10-oz prime rib with two sides is a good deal. You can't get anything comparable in that area at that quality for that price. \n\nBeing negative for the sake of being negative isn't the flex that you seem to think it is.",
            "author": "WelcomeToBrooklandia",
            "score": 0,
            "created_at": "2024-10-11T21:09:44.000Z",
            "parent_id": "t1_lrh0oja",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1fba/"
          },
          {
            "id": "t1_lrizy2a",
            "content": "I believe the original issue wasn’t the $35. It’s that the post is worded in a way that makes it seem you get all that for $19.",
            "author": "QuestoPresto",
            "score": 1,
            "created_at": "2024-10-12T05:45:23.000Z",
            "parent_id": "t1_lrh1fba",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrizy2a/"
          },
          {
            "id": "t1_lrjy99y",
            "content": "Yup.  The prime rib is cooked really well and they have the process dial down. I would recommend it to anyone who likes prime rib.  The service is also really good.",
            "author": "AutofillUserID",
            "score": 1,
            "created_at": "2024-10-12T12:04:00.000Z",
            "parent_id": "t1_lrizy2a",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjy99y/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 15,
      "chunkId": "chunk_t1_lrhpj8u",
      "commentCount": 3,
      "rootCommentScore": 6,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrhpj8u",
            "content": "Best bang for your buck has to be Schlotzsky’s buy one get one free pizza on Wednesdays. Basically $5 per pizza. Cheaper than dominos",
            "author": "BigBoiBenisBlueBalls",
            "score": 6,
            "created_at": "2024-10-11T23:43:25.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhpj8u/"
          },
          {
            "id": "t1_lri0is1",
            "content": "I didn’t know about that, is that any location? Also, I’m literally still sad that they took away the pesto sauce, their new generic tomato sauce is such a bummer lol. ",
            "author": "Abysstreadr",
            "score": 2,
            "created_at": "2024-10-12T00:58:57.000Z",
            "parent_id": "t1_lrhpj8u",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri0is1/"
          },
          {
            "id": "t1_lri14zz",
            "content": "Yeah any location on Wednesday’s. Also $5 pizzas after 5pm Friday Saturday Sunday with is the same thing but I’m not sure how long that offer is good for. The Wednesday one is forever. Hmm I like it 🤔",
            "author": "BigBoiBenisBlueBalls",
            "score": 1,
            "created_at": "2024-10-12T01:03:16.000Z",
            "parent_id": "t1_lri0is1",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri14zz/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 16,
      "chunkId": "chunk_t1_lrgyby5",
      "commentCount": 1,
      "rootCommentScore": 5,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrgyby5",
            "content": "You should have gone to Luby's instead.",
            "author": "Remarkable-Bid-7471",
            "score": 5,
            "created_at": "2024-10-11T20:51:48.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgyby5/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 17,
      "chunkId": "chunk_t1_lri78p5",
      "commentCount": 2,
      "rootCommentScore": 4,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lri78p5",
            "content": "This thread is a godsend!",
            "author": "BeerIsTheMindSpiller",
            "score": 4,
            "created_at": "2024-10-12T01:47:00.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri78p5/"
          },
          {
            "id": "t1_lrlg436",
            "content": "I’m jealous Dallas doesn’t have a sub for this.",
            "author": "Admirable_Basket381",
            "score": 2,
            "created_at": "2024-10-12T17:35:41.000Z",
            "parent_id": "t1_lri78p5",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlg436/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 18,
      "chunkId": "chunk_t1_lrfom5l",
      "commentCount": 5,
      "rootCommentScore": 4,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfom5l",
            "content": "that's where that motorcycle shop is/was?",
            "author": "leanmeanvagine",
            "score": 4,
            "created_at": "2024-10-11T16:40:19.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfom5l/"
          },
          {
            "id": "t1_lrfos4g",
            "content": "I guess I’m unfamiliar with that. It’s at the corner of Monroe and Congress",
            "author": "Street-Ask5154",
            "score": 4,
            "created_at": "2024-10-11T16:41:12.000Z",
            "parent_id": "t1_lrfom5l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfos4g/"
          },
          {
            "id": "t1_lrfy5b3",
            "content": "No its where Central Standard was",
            "author": "SecretHeroes",
            "score": 0,
            "created_at": "2024-10-11T17:31:27.000Z",
            "parent_id": "t1_lrfos4g",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy5b3/"
          },
          {
            "id": "t1_lrg4h8y",
            "content": "No. Across the little outdoor entrance area.",
            "author": "stevendaedelus",
            "score": 2,
            "created_at": "2024-10-11T18:05:35.000Z",
            "parent_id": "t1_lrfom5l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg4h8y/"
          },
          {
            "id": "t1_lrg7gmc",
            "content": "Ah yeah, that's what I meant.  I had a Monte Cristo there before...was pretty good.\n\nFor my mouth, that is, not my arteries.",
            "author": "leanmeanvagine",
            "score": 3,
            "created_at": "2024-10-11T18:21:58.000Z",
            "parent_id": "t1_lrg4h8y",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg7gmc/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 19,
      "chunkId": "chunk_t1_lrlahsu",
      "commentCount": 1,
      "rootCommentScore": 4,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrlahsu",
            "content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.\nAnd since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
            "author": "DrippingAgent",
            "score": 4,
            "created_at": "2024-10-12T17:05:13.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlahsu/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 20,
      "chunkId": "chunk_t1_lrggeej",
      "commentCount": 1,
      "rootCommentScore": 3,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrggeej",
            "content": "Yellow Rose prime rib",
            "author": "Bulk-of-the-Series",
            "score": 3,
            "created_at": "2024-10-11T19:11:13.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggeej/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 21,
      "chunkId": "chunk_t1_lrfygmz",
      "commentCount": 1,
      "rootCommentScore": 3,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfygmz",
            "content": "Ya $35 as a “special” ain’t it 😂 and if it’s good, that’s the first thing that’s good at that spot",
            "author": "PristineDriver6485",
            "score": 3,
            "created_at": "2024-10-11T17:33:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfygmz/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 22,
      "chunkId": "chunk_t1_lrhug9y",
      "commentCount": 3,
      "rootCommentScore": 3,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrhug9y",
            "content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
            "author": "milli_138",
            "score": 3,
            "created_at": "2024-10-12T00:17:11.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhug9y/"
          },
          {
            "id": "t1_lrifwa2",
            "content": "What's the last time you went? \n\nWe went about a year and a half ago and while they had a happy hour up on their website, they said they stopped doing that since covid and wound up spending $30 on some mediocre entrees and drinks that were 3X the price listed for that time online.\n\nHaven't bothered with it since, but the atmosphere seemed great and the employees were fantastic so we had a good time and made a mental note that it was more of a decent occasional date night place rather than the land of the killer happy-hour we had heard of.",
            "author": "Econolife-350",
            "score": 1,
            "created_at": "2024-10-12T02:49:11.000Z",
            "parent_id": "t1_lrhug9y",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrifwa2/"
          },
          {
            "id": "t1_lrivtjz",
            "content": "I’d have to look up what show it was for when we last went. I would guess within the past two months? You do have to sit at that cool bar way in the back. Not the one you can see when you enter.  I thought it was a rare amount of craftsmenship and once I learned the story of the bar I was really impressed with it, honestly.",
            "author": "milli_138",
            "score": 2,
            "created_at": "2024-10-12T05:04:17.000Z",
            "parent_id": "t1_lrifwa2",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrivtjz/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 23,
      "chunkId": "chunk_t1_lrirdbo",
      "commentCount": 1,
      "rootCommentScore": 3,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrirdbo",
            "content": "Long time Perry’s pork chop eater, first time poster. I am a HUGE steak person. I will admit, if I’m attending Perry’s on the company dime, I will usually order beef. HOWEVER until I tried the Perry’s pork chop I have never had a moist and tender pork dish. Man oh man did Perry’s prove my assumptions wrong. Their Friday special is not only a great deal but also delicious.",
            "author": "ObligationSquare6318",
            "score": 3,
            "created_at": "2024-10-12T04:23:10.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrirdbo/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 24,
      "chunkId": "chunk_t1_lro6uqc",
      "commentCount": 1,
      "rootCommentScore": 3,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lro6uqc",
            "content": "Bruh never had the Pork Chop friday special at Perrys.",
            "author": "Lobster_Donkey_36",
            "score": 3,
            "created_at": "2024-10-13T03:57:33.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lro6uqc/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 25,
      "chunkId": "chunk_t1_lrhowlg",
      "commentCount": 2,
      "rootCommentScore": 2,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrhowlg",
            "content": "This looks awful",
            "author": "iamjay92",
            "score": 2,
            "created_at": "2024-10-11T23:39:05.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhowlg/"
          },
          {
            "id": "t1_lrlrx5i",
            "content": "Took me way too long scrolling to find a comment saying this lol. That plate looks revolting asf",
            "author": "1Dzach",
            "score": 3,
            "created_at": "2024-10-12T18:40:30.000Z",
            "parent_id": "t1_lrhowlg",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlrx5i/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 26,
      "chunkId": "chunk_t1_lrg29zb",
      "commentCount": 1,
      "rootCommentScore": 2,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrg29zb",
            "content": "Are all the specials beef and pork chop related?",
            "author": "barrorg",
            "score": 2,
            "created_at": "2024-10-11T17:53:40.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg29zb/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 27,
      "chunkId": "chunk_t1_lrkhs0s",
      "commentCount": 4,
      "rootCommentScore": 2,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrkhs0s",
            "content": "Palazzio’s men club first Friday of every month between 12-3 free prime rib included with $10 cover charge.",
            "author": "El_Sueno56",
            "score": 2,
            "created_at": "2024-10-12T14:20:41.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkhs0s/"
          },
          {
            "id": "t1_lrmhmjk",
            "content": "Is it good?",
            "author": "Street-Ask5154",
            "score": 1,
            "created_at": "2024-10-12T21:08:05.000Z",
            "parent_id": "t1_lrkhs0s",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrmhmjk/"
          },
          {
            "id": "t1_lrz9nee",
            "content": "lol it’s edible but you get to look at nude tits",
            "author": "El_Sueno56",
            "score": 1,
            "created_at": "2024-10-15T02:30:45.000Z",
            "parent_id": "t1_lrmhmjk",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrz9nee/"
          },
          {
            "id": "t1_lrzbilb",
            "content": "Nothin better then nude tits",
            "author": "Street-Ask5154",
            "score": 1,
            "created_at": "2024-10-15T02:42:33.000Z",
            "parent_id": "t1_lrz9nee",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrzbilb/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 28,
      "chunkId": "chunk_t1_lrfu1bn",
      "commentCount": 3,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfu1bn",
            "content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
            "author": "Front-Statement-1636",
            "score": 1,
            "created_at": "2024-10-11T17:09:21.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfu1bn/"
          },
          {
            "id": "t1_lrg4mt9",
            "content": "What’s the pipe hit?",
            "author": "RoleModelsinBlood31",
            "score": 1,
            "created_at": "2024-10-11T18:06:25.000Z",
            "parent_id": "t1_lrfu1bn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg4mt9/"
          },
          {
            "id": "t1_lri4phi",
            "content": "Yo' mama",
            "author": "Flaky_Floor_6390",
            "score": 5,
            "created_at": "2024-10-12T01:28:47.000Z",
            "parent_id": "t1_lrg4mt9",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4phi/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 29,
      "chunkId": "chunk_t1_lrfvdnj",
      "commentCount": 2,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrfvdnj",
            "content": "Josephine House’s steak night on Monday’s is fantastic",
            "author": "ptran90",
            "score": 1,
            "created_at": "2024-10-11T17:16:35.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfvdnj/"
          },
          {
            "id": "t1_lri5uyn",
            "content": "Comments like this make me so sad I can’t go out to dinner at the drop of a hat anymore bc of young children. Oh well. One day again.",
            "author": "leavinonajetplane7",
            "score": 3,
            "created_at": "2024-10-12T01:37:10.000Z",
            "parent_id": "t1_lrfvdnj",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri5uyn/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 30,
      "chunkId": "chunk_t1_lrhvymt",
      "commentCount": 1,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrhvymt",
            "content": "Yum 😋",
            "author": "MsMo999",
            "score": 1,
            "created_at": "2024-10-12T00:27:34.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhvymt/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 31,
      "chunkId": "chunk_t1_lrhwojq",
      "commentCount": 1,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrhwojq",
            "content": "Is Fennario Flats still playing that Friday lunch?",
            "author": "Sparkadelic007",
            "score": 1,
            "created_at": "2024-10-12T00:32:32.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhwojq/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 32,
      "chunkId": "chunk_t1_lria93g",
      "commentCount": 2,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lria93g",
            "content": "Whats...uh..nuzzling..embracing? Supporting!  the questionable meat piece? Creamed spinach. Potato puree and something else I can't make out.",
            "author": "MongooseOk941",
            "score": 1,
            "created_at": "2024-10-12T02:08:36.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lria93g/"
          },
          {
            "id": "t1_lrkeaem",
            "content": "Horseradish",
            "author": "Coujelais",
            "score": 2,
            "created_at": "2024-10-12T13:58:53.000Z",
            "parent_id": "t1_lria93g",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkeaem/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 33,
      "chunkId": "chunk_t1_lrk5jkk",
      "commentCount": 1,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrk5jkk",
            "content": "Tumble 22 happy hour sandwich + 1 side for ..$8?",
            "author": "masterbirder",
            "score": 1,
            "created_at": "2024-10-12T12:59:43.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk5jkk/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 34,
      "chunkId": "chunk_t1_lrlcqf1",
      "commentCount": 1,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrlcqf1",
            "content": "super burrito on tuesdays ",
            "author": "Objective_Roof_8539",
            "score": 1,
            "created_at": "2024-10-12T17:17:24.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlcqf1/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 35,
      "chunkId": "chunk_t1_lrol3qk",
      "commentCount": 1,
      "rootCommentScore": 1,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrol3qk",
            "content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
            "author": "Money-Information-99",
            "score": 1,
            "created_at": "2024-10-13T06:07:01.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrol3qk/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 36,
      "chunkId": "chunk_t1_lrlg6dg",
      "commentCount": 1,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrlg6dg",
            "content": "Man, I've never heard of this maies daies place. Gotta check-in out!",
            "author": "AffectionatePie8588",
            "score": 0,
            "created_at": "2024-10-12T17:36:02.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlg6dg/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 37,
      "chunkId": "chunk_t1_lrg2f0v",
      "commentCount": 2,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrg2f0v",
            "content": "it looks like someone made a diaper out of a steak but I would still eat the shit out of that. It looks amazing",
            "author": "yourdadsboyfie",
            "score": 0,
            "created_at": "2024-10-11T17:54:25.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg2f0v/"
          },
          {
            "id": "t1_lrji7io",
            "content": "Hmm, my tired brain initially understood that as you'd eat the shit out of a diaper.\n\nYikes.",
            "author": "Stickyv35",
            "score": 2,
            "created_at": "2024-10-12T09:16:07.000Z",
            "parent_id": "t1_lrg2f0v",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrji7io/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 38,
      "chunkId": "chunk_t1_lrhqzd7",
      "commentCount": 3,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrhqzd7",
            "content": "Awesome deal.  That’s almost the same cost as two Torchy’s tacos and a soda.",
            "author": "TX_spacegeek",
            "score": 0,
            "created_at": "2024-10-11T23:53:16.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhqzd7/"
          },
          {
            "id": "t1_lri89gm",
            "content": "Their mass produced tortillas in bulk are the absolute worst.  Gross",
            "author": "ganczha",
            "score": 4,
            "created_at": "2024-10-12T01:54:20.000Z",
            "parent_id": "t1_lrhqzd7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri89gm/"
          },
          {
            "id": "t1_lrif3u2",
            "content": "To be fair, as pictured it's $35 which I find funny they don't mention.",
            "author": "Econolife-350",
            "score": 3,
            "created_at": "2024-10-12T02:43:28.000Z",
            "parent_id": "t1_lrhqzd7",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrif3u2/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 39,
      "chunkId": "chunk_t1_lri6vt6",
      "commentCount": 1,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lri6vt6",
            "content": "Maie Day bitches",
            "author": "Gabby692024",
            "score": 0,
            "created_at": "2024-10-12T01:44:28.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6vt6/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 40,
      "chunkId": "chunk_t1_lriz3q0",
      "commentCount": 1,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lriz3q0",
            "content": "Anything at Torchys",
            "author": "StoreRevolutionary70",
            "score": 0,
            "created_at": "2024-10-12T05:36:43.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lriz3q0/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 41,
      "chunkId": "chunk_t1_lri2sw8",
      "commentCount": 4,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lri2sw8",
            "content": "That’s so raw 🤢",
            "author": "Doonesbury",
            "score": 0,
            "created_at": "2024-10-12T01:15:12.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri2sw8/"
          },
          {
            "id": "t1_lrjiad0",
            "content": "Well-done beef is best ordered at Golden Corral.",
            "author": "Stickyv35",
            "score": 1,
            "created_at": "2024-10-12T09:17:05.000Z",
            "parent_id": "t1_lri2sw8",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjiad0/"
          },
          {
            "id": "t1_lrk6bsu",
            "content": "It doesn’t have to be well done, just not raw, man.",
            "author": "Doonesbury",
            "score": 0,
            "created_at": "2024-10-12T13:05:17.000Z",
            "parent_id": "t1_lrjiad0",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk6bsu/"
          },
          {
            "id": "t1_lrkehty",
            "content": "Prime rib literally always looks like that",
            "author": "Coujelais",
            "score": 3,
            "created_at": "2024-10-12T14:00:15.000Z",
            "parent_id": "t1_lrk6bsu",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkehty/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 42,
      "chunkId": "chunk_t1_lrgz7bt",
      "commentCount": 6,
      "rootCommentScore": 0,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrgz7bt",
            "content": "Why does everything in Texas come in a pool of beans",
            "author": "lateseasondad",
            "score": 0,
            "created_at": "2024-10-11T20:56:49.000Z",
            "parent_id": "t3_1g1dspf",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgz7bt/"
          },
          {
            "id": "t1_lrh1oyd",
            "content": "That's au jus. No beans on that plate.",
            "author": "WelcomeToBrooklandia",
            "score": 11,
            "created_at": "2024-10-11T21:11:18.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1oyd/"
          },
          {
            "id": "t1_lrh6wis",
            "content": "What a moron 🤦🏻‍♀️😂",
            "author": "Wonderful-Distance51",
            "score": 0,
            "created_at": "2024-10-11T21:42:17.000Z",
            "parent_id": "t1_lrh1oyd",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh6wis/"
          },
          {
            "id": "t1_lrhvzbi",
            "content": "1.) Beans are delicious \n\n\n2.) Ain't beans",
            "author": "cflatjazz",
            "score": 6,
            "created_at": "2024-10-12T00:27:41.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhvzbi/"
          },
          {
            "id": "t1_lri69xv",
            "content": "I too thought it was refried beans, as I’ve never had prime rib.",
            "author": "leavinonajetplane7",
            "score": 1,
            "created_at": "2024-10-12T01:40:08.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri69xv/"
          },
          {
            "id": "t1_lrt9eqh",
            "content": "lolol thought this was a troll post til I read the other comments.",
            "author": "FakeEmpire20",
            "score": 1,
            "created_at": "2024-10-14T01:28:25.000Z",
            "parent_id": "t1_lrgz7bt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrt9eqh/"
          }
        ],
        "extract_from_post": false
      }
    },
    {
      "chunkIndex": 43,
      "chunkId": "chunk_orphaned_t3_1g1dspf",
      "commentCount": 13,
      "rootCommentScore": 43,
      "extractFromPost": false,
      "post": {
        "id": "t3_1g1dspf",
        "title": "Best special in Austin?",
        "content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "subreddit": "austinfood",
        "author": "Street-Ask5154",
        "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "score": 345,
        "created_at": "2024-10-11T16:25:03.000Z",
        "comments": [
          {
            "id": "t1_lrgogtu",
            "content": "Yes. I’m a ribeye steak guy and I’m not a pork chop guy. Except for Perry’s. I’ll take a Perry’s pork chop over almost any cut of beef",
            "author": "Zurrascaped",
            "score": 17,
            "created_at": "2024-10-11T19:56:30.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgogtu/"
          },
          {
            "id": "t1_lrkwu2b",
            "content": "Exactly. Perry's pork chop is better than 90% of the steaks I've had in my life.",
            "author": "qaat",
            "score": 1,
            "created_at": "2024-10-12T15:48:12.000Z",
            "parent_id": "t1_lrgogtu",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkwu2b/"
          },
          {
            "id": "t1_lri23ke",
            "content": "The seasoning for prime rib comes from the au jus. It’s the tenderness of the meat plus the saltiness of the au jus that makes the whole experience. \n\nIt is not just my favorite preparation of beef, it is my favorite food period. I am not allured by the price. There is plenty of expensive food that I could care less about (filet mignon comes to mind).",
            "author": "regissss",
            "score": 4,
            "created_at": "2024-10-12T01:10:09.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri23ke/"
          },
          {
            "id": "t1_lri6oj7",
            "content": "Yep prime rib is overrated",
            "author": "XTingleInTheDingleX",
            "score": 1,
            "created_at": "2024-10-12T01:43:03.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6oj7/"
          },
          {
            "id": "t1_lrh6ev9",
            "content": "Prime rib isn’t seasoned? That seems like a preparation issue, also there’s an au jus for a reason.",
            "author": "southpark",
            "score": 1,
            "created_at": "2024-10-11T21:39:19.000Z",
            "parent_id": "t1_lrgjf4l",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh6ev9/"
          },
          {
            "id": "t1_lrfwgya",
            "content": "Try looking for a moist one. They're much better!",
            "author": "Reddit_Commenter_69",
            "score": 43,
            "created_at": "2024-10-11T17:22:26.000Z",
            "parent_id": "t1_lrftnvn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfwgya/"
          },
          {
            "id": "t1_lrfy6qi",
            "content": "I have had some dry ones on occasion as well.  Unfortunately, the overall quality and experience at Perry's has declined even as the price has gone up. But it is still a pretty great lunch special.",
            "author": "Tweedle_DeeDum",
            "score": 11,
            "created_at": "2024-10-11T17:31:40.000Z",
            "parent_id": "t1_lrftnvn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy6qi/"
          },
          {
            "id": "t1_lrggzjo",
            "content": "I've had the opposite problem with the Brussel sprouts.  You can send them back if they are not done correctly.",
            "author": "Tweedle_DeeDum",
            "score": 1,
            "created_at": "2024-10-11T19:14:31.000Z",
            "parent_id": "t1_lrgd4xr",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggzjo/"
          },
          {
            "id": "t1_lriowpi",
            "content": "It's probably all the money Chris Perry is spending on all the lawsuits. All of his many, many, *many* lawsuits for wage theft.",
            "author": "ApprehensiveHippo401",
            "score": 1,
            "created_at": "2024-10-12T04:01:24.000Z",
            "parent_id": "t1_lrfy6qi",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lriowpi/"
          },
          {
            "id": "t1_lrg44xt",
            "content": "This. It’s a terrible way to cook a pork chop. It’s not even worth keeping the leftovers the few times I’ve been.",
            "author": "stevendaedelus",
            "score": 0,
            "created_at": "2024-10-11T18:03:45.000Z",
            "parent_id": "t1_lrftnvn",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg44xt/"
          },
          {
            "id": "t1_lrmmwdy",
            "content": "Thanks. Apparently we committed heresy by saying it’s often dry",
            "author": "canofspam2020",
            "score": 2,
            "created_at": "2024-10-12T21:40:06.000Z",
            "parent_id": "t1_lrg44xt",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrmmwdy/"
          },
          {
            "id": "t1_lrn038v",
            "content": "Fuck em if they like a poorly cooked pork chop.",
            "author": "stevendaedelus",
            "score": 1,
            "created_at": "2024-10-12T23:04:04.000Z",
            "parent_id": "t1_lrmmwdy",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrn038v/"
          },
          {
            "id": "t1_lrlayen",
            "content": "Yes, it depends on the cut you get. It’s unlimited wine too haha unless they have changed it",
            "author": "ptran90",
            "score": 1,
            "created_at": "2024-10-12T17:07:44.000Z",
            "parent_id": "t1_lrk1zld",
            "url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlayen/"
          }
        ],
        "extract_from_post": false
      }
    }
  ],
  "output": {
    "mentions": [
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "terrific",
          "house roasted"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "friday",
          "lunch"
        ],
        "dish_categories": [
          "prime rib",
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "Not sure that's better than Perry's Friday pork chop lunch special.",
        "source_created_at": "2024-10-11T16:43:23.000Z",
        "source_id": "t1_lrfp6ta",
        "source_type": "comment",
        "source_ups": 262,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6ta/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "friday",
          "lunch"
        ],
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Friday pork chop lunch special",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "Perry's pork chop is incredible. Add in the applesauce snf fuck yes.",
        "source_created_at": "2024-10-12T02:51:08.000Z",
        "source_id": "t1_lrig5px",
        "source_type": "comment",
        "source_ups": 10,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrig5px/",
        "temp_id": "mention_3",
        "dish_attributes_descriptive": [
          "incredible"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "I've had the pork chop over a dozen times at three different locations across Texas. Never once was it tough.\n\nNormally, Perry's is an expensive place. I mean, they charge $14 for a house Caesar salad! However, the Friday pork chop special is just that, damn special! If you can refrain from ordering apps, cocktails, starter salads, and dessert, a $20 meal that could easily be split into two portions is a big win in 2024.",
        "source_created_at": "2024-10-12T08:53:00.000Z",
        "source_id": "t1_lrjgas7",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjgas7/",
        "temp_id": "mention_4",
        "dish_attributes_descriptive": [
          "special",
          "big win"
        ],
        "dish_attributes_selective": [
          "friday"
        ],
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop special",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "You're not supposed to go back to work after Friday pork chop lunch at Perry's",
        "source_created_at": "2024-10-12T00:17:53.000Z",
        "source_id": "t1_lrhujz5",
        "source_type": "comment",
        "source_ups": 44,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhujz5/",
        "temp_id": "mention_5",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "friday",
          "lunch"
        ],
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Friday pork chop lunch",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "They smoked their pork chop for 4 to 6 hours. Then they see it with a brown sugar like rub. The darker it is more tender it is. Like many have said it can be dry sometimes if it hasn’t been smoked for long enough, but it still an excellent deal. \nI know the domain location gets slammed where they have to serve over 1000 pork chops on Friday during lunch so the consistency may not be as tender as dinner time.",
        "source_created_at": "2024-10-12T12:37:03.000Z",
        "source_id": "t1_lrk2fx9",
        "source_type": "comment",
        "source_ups": 2,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk2fx9/",
        "temp_id": "mention_6",
        "dish_attributes_descriptive": [
          "smoked",
          "tender",
          "excellent deal"
        ],
        "dish_attributes_selective": [
          "friday",
          "lunch"
        ],
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "Interesting. I didn’t know how it was prepared, just that it is delicious. I love the three different sections, as they do feel like 3 completely different pieces of meat, all served on one plate. Naturally, my first time having it was the best and other times it hasn’t been quite as good, but always very tasty and the deal on Friday is just a bonus.",
        "source_created_at": "2024-10-12T14:08:32.000Z",
        "source_id": "t1_lrkfsw9",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkfsw9/",
        "temp_id": "mention_7",
        "dish_attributes_descriptive": [
          "delicious",
          "tasty"
        ],
        "dish_attributes_selective": [
          "friday"
        ],
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "it",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "I don’t know if you’ve had it but it’s a REALLY good pork chop. Never had anything like it.",
        "source_created_at": "2024-10-11T23:15:24.000Z",
        "source_id": "t1_lrhldza",
        "source_type": "comment",
        "source_ups": 6,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhldza/",
        "temp_id": "mention_8",
        "dish_attributes_descriptive": [
          "good"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_2",
        "source_content": "I've heard their pork chop is pretty good.",
        "source_created_at": "2024-10-11T21:33:47.000Z",
        "source_id": "t1_lrh5hr1",
        "source_type": "comment",
        "source_ups": 0,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh5hr1/",
        "temp_id": "mention_9",
        "dish_attributes_descriptive": [
          "good"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "pork chop",
          "chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
        "source_created_at": "2024-10-11T16:43:20.000Z",
        "source_id": "t1_lrfp6g7",
        "source_type": "comment",
        "source_ups": 110,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6g7/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "perfectly cooked"
        ],
        "dish_attributes_selective": [
          "prime rib",
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
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
        "source_created_at": "2024-10-11T16:43:20.000Z",
        "source_id": "t1_lrfp6g7",
        "source_type": "comment",
        "source_ups": 110,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6g7/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "lunch",
          "special"
        ],
        "dish_categories": [
          "deal"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "lunch deals",
        "dish_primary_category": "deal",
        "dish_temp_id": "dish_2"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
        "source_created_at": "2024-10-11T16:43:20.000Z",
        "source_id": "t1_lrfp6g7",
        "source_type": "comment",
        "source_ups": 110,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6g7/",
        "temp_id": "mention_3",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "enchilada"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "enchiladas",
        "dish_primary_category": "enchilada",
        "dish_temp_id": "dish_3"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "The Maie Day prime rib special is such an underrated gem. The beef is perfectly cooked, and if you do decide to pay extra for the sides, you're still getting an excellent (and filling- I brought leftovers home the last time I did this) steak meal for $35. Not too shabby in 2024 Austin.\n\nBut I think that the absolute best bang-for-your-buck specials in Austin are the lunch deals at Habanero Cafe. $9-13 for a truly gut-busting plate of food, and I've never had a special there at I didn't love (the enchiladas are my particular favorites, but the carne guisada is a close second).",
        "source_created_at": "2024-10-11T16:43:20.000Z",
        "source_id": "t1_lrfp6g7",
        "source_type": "comment",
        "source_ups": 110,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfp6g7/",
        "temp_id": "mention_4",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "carne guisada",
          "carne"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "carne guisada",
        "dish_primary_category": "carne guisada",
        "dish_temp_id": "dish_4"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero",
        "restaurant_temp_id": "rest_2",
        "source_content": "Habanero lunch special prices make you feel like you time traveled back to 2011.",
        "source_created_at": "2024-10-11T17:46:14.000Z",
        "source_id": "t1_lrg0vke",
        "source_type": "comment",
        "source_ups": 34,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg0vke/",
        "temp_id": "mention_5",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "lunch",
          "special"
        ],
        "dish_categories": [
          "price"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "lunch special prices",
        "dish_primary_category": "price",
        "dish_temp_id": "dish_5"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "Beef fajita ranchera plate is king of the lunch specials for me. 🫶🏼",
        "source_created_at": "2024-10-11T18:11:40.000Z",
        "source_id": "t1_lrg5lml",
        "source_type": "comment",
        "source_ups": 12,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg5lml/",
        "temp_id": "mention_6",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "lunch",
          "special"
        ],
        "dish_categories": [
          "beef fajita ranchera plate",
          "fajita ranchera plate",
          "ranchera plate",
          "fajita",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Beef fajita ranchera plate",
        "dish_primary_category": "beef fajita ranchera plate",
        "dish_temp_id": "dish_6"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "that little spot",
        "restaurant_temp_id": "rest_2",
        "source_content": "I love that little spot.",
        "source_created_at": "2024-10-12T01:27:28.000Z",
        "source_id": "t1_lri4iq4",
        "source_type": "comment",
        "source_ups": 2,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4iq4/",
        "temp_id": "mention_7"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥️♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_8",
        "dish_attributes_descriptive": [
          "fried"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "burrito"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "fried burritos",
        "dish_primary_category": "burrito",
        "dish_temp_id": "dish_7"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥️♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_9",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "flauta"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "flautas",
        "dish_primary_category": "flauta",
        "dish_temp_id": "dish_8"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥️♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_10",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "soup"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "soup",
        "dish_primary_category": "soup",
        "dish_temp_id": "dish_9"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_11",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "migas"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "migas",
        "dish_primary_category": "migas",
        "dish_temp_id": "dish_10"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_12",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "fajita"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "fajitas",
        "dish_primary_category": "fajita",
        "dish_temp_id": "dish_11"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_13",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "quesadilla"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "quesadillas",
        "dish_primary_category": "quesadilla",
        "dish_temp_id": "dish_12"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_14",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "breakfast",
          "carne"
        ],
        "dish_categories": [
          "taco"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "breakfast or carne tacos",
        "dish_primary_category": "taco",
        "dish_temp_id": "dish_13"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_15",
        "dish_attributes_descriptive": [
          "nice",
          "simple"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "bean"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "beans",
        "dish_primary_category": "bean",
        "dish_temp_id": "dish_14"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "habanero cafe",
        "restaurant_original_text": "Habanero Cafe",
        "restaurant_temp_id": "rest_2",
        "source_content": "So much. 🥹 The staff in particular. I keep seeing food go out to other tables that looks so so good and it’s torture because I come there specifically for what I order. Looks so good: the fried burritos, flautas, soup. Gotta have: migas, fajitas, quesadillas, breakfast or carne tacos. ♥♥️♥️\n\nEdit they have really nice simple beans and rice as well and I noticed so many people around me don’t even take one bite of either. It kills me.😭",
        "source_created_at": "2024-10-12T01:30:30.000Z",
        "source_id": "t1_lri4y07",
        "source_type": "comment",
        "source_ups": 5,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri4y07/",
        "temp_id": "mention_16",
        "dish_attributes_descriptive": [
          "nice",
          "simple"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "rice"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "rice",
        "dish_primary_category": "rice",
        "dish_temp_id": "dish_15"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "chilakillers",
        "restaurant_original_text": "Chilakillers",
        "restaurant_temp_id": "rest_3",
        "source_content": "Chilakillers gigantic burrito plate for 6.99. Nuff said",
        "source_created_at": "2024-10-12T01:02:31.000Z",
        "source_id": "t1_lri1173",
        "source_type": "comment",
        "source_ups": 6,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri1173/",
        "temp_id": "mention_17",
        "dish_attributes_descriptive": [
          "gigantic"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "burrito plate",
          "burrito"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "gigantic burrito plate",
        "dish_primary_category": "burrito plate",
        "dish_temp_id": "dish_16"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "restaurant_temp_id": "rest_1",
        "source_content": "I’ll probably get creamed for this, but the Texas Roadhouse Early Dine menu ($11.99) has 12 entrees to choose from. Sides are cheap as hell. It’s pretty good food for the money.",
        "source_created_at": "2024-10-11T17:12:47.000Z",
        "source_id": "t1_lrfuod7",
        "source_type": "comment",
        "source_ups": 84,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfuod7/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "cheap"
        ],
        "dish_categories": [
          "entree"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "12 entrees",
        "dish_primary_category": "entree",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": [
          "budget-friendly"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "roadhouse",
        "restaurant_temp_id": "rest_1",
        "source_content": "Love me some roadhouse.  I’m too old to worry about being cool or a hyped place. It’s like 26.99 for an 18oz rib there with two sides and I’ve really never been let down.  Part of the reason I own stock in the company",
        "source_created_at": "2024-10-11T18:04:03.000Z",
        "source_id": "t1_lrg46x1",
        "source_type": "comment",
        "source_ups": 33,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg46x1/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "18oz rib",
        "dish_primary_category": "rib",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Texas Roadhouse",
        "restaurant_temp_id": "rest_1",
        "source_content": "I agree. If you can take a moment to choose your own steak from the meat case and find a ribeye with great marbling, Texas Roadhouse is an absolute winner in 2024. Great value and always a fun time, especially if you can get the server to chat a bit! The drinks are decent, too. \n\nIf we want to eat steak &amp; have some margs without breaking the bank, Texas Roadhouse is the destination!",
        "source_created_at": "2024-10-12T09:01:38.000Z",
        "source_id": "t1_lrjh0n4",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjh0n4/",
        "temp_id": "mention_3",
        "dish_attributes_descriptive": [
          "great marbling"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "ribeye",
          "steak"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "ribeye",
        "dish_primary_category": "ribeye",
        "dish_temp_id": "dish_3",
        "restaurant_attributes": [
          "great value"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Roadhouse",
        "restaurant_temp_id": "rest_1",
        "source_content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
        "source_created_at": "2024-10-11T19:43:26.000Z",
        "source_id": "t1_lrgm3rj",
        "source_type": "comment",
        "source_ups": 8,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgm3rj/",
        "temp_id": "mention_4",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "roll"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "rolls",
        "dish_primary_category": "roll",
        "dish_temp_id": "dish_4",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "texas roadhouse",
        "restaurant_original_text": "Roadhouse",
        "restaurant_temp_id": "rest_1",
        "source_content": "I love Roadhouse. No shame. The rolls and sweet potato with marshmallows? Manna from heaven.",
        "source_created_at": "2024-10-11T19:43:26.000Z",
        "source_id": "t1_lrgm3rj",
        "source_type": "comment",
        "source_ups": 8,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgm3rj/",
        "temp_id": "mention_5",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "sweet potato"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "sweet potato with marshmallows",
        "dish_primary_category": "sweet potato",
        "dish_temp_id": "dish_5",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "jack allen's",
        "restaurant_original_text": "Jack Allen’s",
        "restaurant_temp_id": "rest_1",
        "source_content": "Jack Allen’s happy hour is half off apps. You can get literally every app, like 8 different ones, for like $50. It’s a ton of food and a great deal.",
        "source_created_at": "2024-10-11T17:51:04.000Z",
        "source_id": "t1_lrg1s92",
        "source_type": "comment",
        "source_ups": 32,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1s92/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "appetizer"
        ],
        "dish_is_menu_item": false,
        "dish_original_text": "apps",
        "dish_primary_category": "appetizer",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": [
          "happy hour",
          "great deal"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove",
        "restaurant_temp_id": "rest_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_created_at": "2024-10-11T17:06:26.000Z",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "source_ups": 27,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfthzm/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "twice-baked"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib with a twice-baked potato",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove",
        "restaurant_temp_id": "rest_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_created_at": "2024-10-11T17:06:26.000Z",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "source_ups": 27,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfthzm/",
        "temp_id": "mention_2",
        "dish_is_menu_item": true,
        "dish_original_text": "burger",
        "dish_primary_category": "burger",
        "dish_temp_id": "dish_2"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "lonesome dove",
        "restaurant_original_text": "Lonesome Dove",
        "restaurant_temp_id": "rest_1",
        "source_content": "Lonesome Dove's $25 prime rib with a twice-baked potato is pretty dang good. The burger and prime rib sandwich on the lunch menu are both good too.",
        "source_created_at": "2024-10-11T17:06:26.000Z",
        "source_id": "t1_lrfthzm",
        "source_type": "comment",
        "source_ups": 27,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfthzm/",
        "temp_id": "mention_3",
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib sandwich",
        "dish_primary_category": "prime rib sandwich",
        "dish_temp_id": "dish_3"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perrys",
        "restaurant_original_text": "Perry’s",
        "restaurant_temp_id": "rest_1",
        "source_content": "HUGE pork-chop at Perry’s in domain or 7th Street is the best special \nback in my day, price was about $14… now it’s up to $19… Rambles about inflation 😝",
        "source_created_at": "2024-10-11T16:52:49.000Z",
        "source_id": "t1_lrfqypm",
        "source_type": "comment",
        "source_ups": 27,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfqypm/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "huge"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pork-chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perrys",
        "restaurant_original_text": "Perry’s",
        "restaurant_temp_id": "rest_1",
        "source_content": "I remember having it when it was $11. If it was never $11, then I don’t know what I remember. I’m old. But even as a person who doesn’t generally like pork, it actually is quite good.",
        "source_created_at": "2024-10-12T01:35:39.000Z",
        "source_id": "t1_lri5neu",
        "source_type": "comment",
        "source_ups": 2,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri5neu/",
        "temp_id": "mention_2",
        "dish_is_menu_item": true,
        "dish_original_text": "it",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "church's",
        "restaurant_original_text": "Church's",
        "restaurant_temp_id": "rest_1",
        "source_content": "Once again, for those on a real budget, Church's \"Texas Two Piece Feast\" for $3.50 fills me up. Leg, thigh, biscuit, and jalapeno. Best deal anywhere.",
        "source_created_at": "2024-10-11T19:49:51.000Z",
        "source_id": "t1_lrgn98r",
        "source_type": "comment",
        "source_ups": 25,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgn98r/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "budget-friendly"
        ],
        "dish_categories": [
          "chicken",
          "biscuit",
          "jalapeno"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Texas Two Piece Feast",
        "dish_primary_category": "texas two piece feast",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": [
          "budget-friendly"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "popeye's",
        "restaurant_original_text": "Popeye's",
        "restaurant_temp_id": "rest_2",
        "source_content": "I used to live next to a Popeye's. If I swung by about 20 minutes before they closed they'd give me the \"manager's special.\" Generally $5 and they'd just send me home with a giant box of chicken and sides. My wife thought it was amazing the first time, pretty quickly convinced me to forget it was a possibility. I was prepared to eat fried chicken daily.",
        "source_created_at": "2024-10-12T06:00:26.000Z",
        "source_id": "t1_lrj1e65",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrj1e65/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": [
          "fried"
        ],
        "dish_attributes_selective": [
          "budget-friendly"
        ],
        "dish_categories": [
          "chicken",
          "sides"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "manager's special",
        "dish_primary_category": "manager's special",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": [
          "budget-friendly"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
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
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": "hillside farmacy",
        "restaurant_temp_id": "rest_2",
        "source_content": "More casual but hillside farmacy does $20 old fashion with burger and fries on Wednesday and it was phenomenal!",
        "source_created_at": "2024-10-11T18:53:59.000Z",
        "source_id": "t1_lrgdaji",
        "source_type": "comment",
        "source_ups": 24,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgdaji/",
        "temp_id": "mention_2",
        "dish_categories": [
          "old fashion",
          "burger",
          "fries"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "old fashion with burger and fries",
        "dish_primary_category": "old fashion",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": [
          "casual"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "hillside farmacy",
        "restaurant_original_text": "Hillside",
        "restaurant_temp_id": "rest_2",
        "source_content": "They also do a steak night on Sundays! Love Hillside.",
        "source_created_at": "2024-10-14T01:26:49.000Z",
        "source_id": "t1_lrt967k",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrt967k/",
        "temp_id": "mention_3",
        "dish_categories": [
          "steak"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak night",
        "dish_primary_category": "steak",
        "dish_temp_id": "dish_3"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "house roasted"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "special"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "polazios",
        "restaurant_original_text": "Polazios",
        "restaurant_temp_id": "rest_2",
        "source_content": "Polazios 1st Friday’s $10 prime rib.",
        "source_created_at": "2024-10-11T16:58:08.000Z",
        "source_id": "t1_lrfryrh",
        "source_type": "comment",
        "source_ups": 20,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfryrh/",
        "temp_id": "mention_2",
        "dish_attributes_selective": [
          "prime rib"
        ],
        "dish_categories": [
          "prime rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib"
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "polazios",
        "restaurant_original_text": "Polazios",
        "restaurant_temp_id": "rest_2",
        "source_content": "Prime rib with a view😎",
        "source_created_at": "2024-10-11T19:48:20.000Z",
        "source_id": "t1_lrgmzdw",
        "source_type": "comment",
        "source_ups": 11,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgmzdw/",
        "temp_id": "mention_3",
        "dish_attributes_selective": [
          "prime rib"
        ],
        "dish_categories": [
          "prime rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Prime rib",
        "dish_primary_category": "prime rib",
        "restaurant_attributes": [
          "view"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "Carve",
        "restaurant_temp_id": "rest_1",
        "source_content": "Carve lunch deal rivals it. \n\nBut a prime rib like my dad ate..",
        "source_created_at": "2024-10-11T16:47:47.000Z",
        "source_id": "t1_lrfq0jn",
        "source_type": "comment",
        "source_ups": 18,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfq0jn/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "lunch"
        ],
        "dish_categories": null,
        "dish_is_menu_item": null,
        "dish_original_text": null,
        "dish_primary_category": null,
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "CARVE®",
        "restaurant_temp_id": "rest_1",
        "source_content": "\"...on Fridays, you are in for a special CARVE® Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes for $19.\"\n\nIt's really good too!",
        "source_created_at": "2024-10-11T17:01:37.000Z",
        "source_id": "t1_lrfsm6j",
        "source_type": "comment",
        "source_ups": 21,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfsm6j/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": [
          "smoked",
          "sliced"
        ],
        "dish_attributes_selective": [
          "lunch"
        ],
        "dish_categories": [
          "new york strip",
          "strip",
          "steak",
          "potato"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Smoked Strip Friday Lunch featuring an 8 oz. smoked, sliced New York Strip served with mashed potatoes",
        "dish_primary_category": "new york strip",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "Carve",
        "restaurant_temp_id": "rest_1",
        "source_content": "This has been my go to Friday lunch for a while. IMO it’s the best steak special in town.",
        "source_created_at": "2024-10-11T17:40:05.000Z",
        "source_id": "t1_lrfzqe7",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfzqe7/",
        "temp_id": "mention_3",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "lunch"
        ],
        "dish_categories": [
          "steak"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak special",
        "dish_primary_category": "steak",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "Carve",
        "restaurant_temp_id": "rest_1",
        "source_content": "And quite possibly the finest cut of meat for the price I've ever encountered.",
        "source_created_at": "2024-10-11T17:42:51.000Z",
        "source_id": "t1_lrg090q",
        "source_type": "comment",
        "source_ups": 2,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg090q/",
        "temp_id": "mention_4",
        "dish_attributes_descriptive": [
          "finest"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "meat"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "cut of meat",
        "dish_primary_category": "meat",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "carve",
        "restaurant_original_text": "Carve",
        "restaurant_temp_id": "rest_1",
        "source_content": "Yup this is the move ",
        "source_created_at": "2024-10-28T00:58:50.000Z",
        "source_id": "t1_lu3s7qg",
        "source_type": "comment",
        "source_ups": 2,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lu3s7qg/",
        "temp_id": "mention_5",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": null,
        "dish_is_menu_item": null,
        "dish_original_text": null,
        "dish_primary_category": null,
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "terrific",
          "house roasted"
        ],
        "dish_categories": [
          "prime rib special",
          "prime rib",
          "beef rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "prime rib special",
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
        "source_created_at": "2024-10-11T17:48:44.000Z",
        "source_id": "t1_lrg1ccu",
        "source_type": "comment",
        "source_ups": 4,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1ccu/",
        "temp_id": "mention_2",
        "dish_attributes_selective": [
          "deal"
        ],
        "dish_categories": [
          "prime rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_2"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "bartlett's",
        "restaurant_original_text": "Bartlett's",
        "restaurant_temp_id": "rest_2",
        "source_content": "So what? Bartlett's charges $44 for an 8-oz prime rib with one side at lunch. At Maie Day, you can get a 10-oz prime rib with two sides for $35. Still a deal.",
        "source_created_at": "2024-10-11T17:48:44.000Z",
        "source_id": "t1_lrg1ccu",
        "source_type": "comment",
        "source_ups": 4,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg1ccu/",
        "temp_id": "mention_3",
        "dish_categories": [
          "prime rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_3"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_3",
        "source_content": "Perry's has been around a lot longer than Maie Day. Makes sense that their special is more popular/well-known. \n\n$35 for a beautifully-cooked 10-oz prime rib with two sides is a good deal. You can't get anything comparable in that area at that quality for that price. \n\nBeing negative for the sake of being negative isn't the flex that you seem to think it is.",
        "source_created_at": "2024-10-11T21:09:44.000Z",
        "source_id": "t1_lrh1fba",
        "source_type": "comment",
        "source_ups": 0,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrh1fba/",
        "temp_id": "mention_4",
        "dish_attributes_descriptive": [
          "beautifully-cooked"
        ],
        "dish_attributes_selective": [
          "good deal"
        ],
        "dish_categories": [
          "prime rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_4"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "Yup.  The prime rib is cooked really well and they have the process dial down. I would recommend it to anyone who likes prime rib.  The service is also really good.",
        "source_created_at": "2024-10-12T12:04:00.000Z",
        "source_id": "t1_lrjy99y",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrjy99y/",
        "temp_id": "mention_5",
        "dish_attributes_descriptive": [
          "cooked really well"
        ],
        "dish_categories": [
          "prime rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_5",
        "restaurant_attributes": [
          "really good service"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "schlotzsky's",
        "restaurant_original_text": "Schlotzsky’s",
        "restaurant_temp_id": "rest_1",
        "source_content": "Best bang for your buck has to be Schlotzsky’s buy one get one free pizza on Wednesdays. Basically $5 per pizza. Cheaper than dominos",
        "source_created_at": "2024-10-11T23:43:25.000Z",
        "source_id": "t1_lrhpj8u",
        "source_type": "comment",
        "source_ups": 6,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhpj8u/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "buy one get one free"
        ],
        "dish_categories": [
          "pizza"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "pizza",
        "dish_primary_category": "pizza",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": [
          "budget-friendly"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "terrific",
          "house roasted"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "friday"
        ],
        "dish_categories": [
          "prime rib special",
          "beef rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": [
          "terrific",
          "house roasted"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "friday"
        ],
        "dish_categories": [
          "prime rib special",
          "beef rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "beef rib"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "central standard",
        "restaurant_original_text": "Central Standard",
        "restaurant_temp_id": "rest_2",
        "source_content": "Ah yeah, that's what I meant.  I had a Monte Cristo there before...was pretty good.\n\nFor my mouth, that is, not my arteries.",
        "source_created_at": "2024-10-11T18:21:58.000Z",
        "source_id": "t1_lrg7gmc",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrg7gmc/",
        "temp_id": "mention_3",
        "dish_attributes_descriptive": [
          "pretty good"
        ],
        "dish_categories": [
          "monte cristo"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Monte Cristo"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "costco",
        "restaurant_original_text": "Costco",
        "restaurant_temp_id": "rest_1",
        "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.And since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
        "source_created_at": "2024-10-12T17:05:13.000Z",
        "source_id": "t1_lrlahsu",
        "source_type": "comment",
        "source_ups": 4,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlahsu/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "100% beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "hot dog",
        "dish_primary_category": "hot dog",
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "costco",
        "restaurant_original_text": "Costco",
        "restaurant_temp_id": "rest_1",
        "source_content": "I n.e.v.e.r. eat hot dogs, but the $1.50 hot dog deal at Costco is impressive. Those 100% beef dogs are the best.And since I brought up Costco, the \"Arrachera\" package, for about $35 is a superb piece of beef. Grilled 6 minutes on each side...",
        "source_created_at": "2024-10-12T17:05:13.000Z",
        "source_id": "t1_lrlahsu",
        "source_type": "comment",
        "source_ups": 4,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlahsu/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": [
          "superb",
          "grilled"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "arrachera package",
        "dish_primary_category": "arrachera",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "yellow rose",
        "restaurant_original_text": "Yellow Rose",
        "restaurant_temp_id": "rest_1",
        "source_content": "Yellow Rose prime rib",
        "source_created_at": "2024-10-11T19:11:13.000Z",
        "source_id": "t1_lrggeej",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrggeej/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "prime rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "eberly",
        "restaurant_original_text": "Eberly",
        "restaurant_temp_id": "rest_1",
        "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
        "source_created_at": "2024-10-12T00:17:11.000Z",
        "source_id": "t1_lrhug9y",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhug9y/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "parmesan"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "burger",
          "fries"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger with a mountain of Parmesan fries",
        "dish_primary_category": "burger and fries",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": [
          "happy hour"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "cedar tavern",
        "restaurant_original_text": "Cedar Tavern",
        "restaurant_temp_id": "rest_2",
        "source_content": "Eberly/Cedar Tavern Happy Hour is pretty ridiculous. Recently went on a date there before a show at the Paramount. We each had a martini ($7) and their burger with a mountain of Parmesan fries ($10). Including 20% tip to the bartender and a $5 tip to the complimentary valet…I spent just shy of $50.",
        "source_created_at": "2024-10-12T00:17:11.000Z",
        "source_id": "t1_lrhug9y",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrhug9y/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": [
          "parmesan"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "burger",
          "fries"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "burger with a mountain of Parmesan fries",
        "dish_primary_category": "burger and fries",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": [
          "happy hour"
        ]
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perrys",
        "restaurant_original_text": "Perry’s",
        "restaurant_temp_id": "rest_1",
        "source_content": "Long time Perry’s pork chop eater, first time poster. I am a HUGE steak person. I will admit, if I’m attending Perry’s on the company dime, I will usually order beef. HOWEVER until I tried the Perry’s pork chop I have never had a moist and tender pork dish. Man oh man did Perry’s prove my assumptions wrong. Their Friday special is not only a great deal but also delicious.",
        "source_created_at": "2024-10-12T04:23:10.000Z",
        "source_id": "t1_lrirdbo",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrirdbo/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "moist",
          "tender",
          "delicious"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "pork chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Perry’s pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "perrys",
        "restaurant_original_text": "Perrys",
        "restaurant_temp_id": "rest_1",
        "source_content": "Bruh never had the Pork Chop friday special at Perrys.",
        "source_created_at": "2024-10-13T03:57:33.000Z",
        "source_id": "t1_lro6uqc",
        "source_type": "comment",
        "source_ups": 3,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lro6uqc/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "friday",
          "special"
        ],
        "dish_categories": [
          "pork chop",
          "pork"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Pork Chop friday special",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
        "source_created_at": "2024-10-11T17:09:21.000Z",
        "source_id": "t1_lrfu1bn",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfu1bn/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "maldon salt finished"
        ],
        "dish_attributes_selective": null,
        "dish_categories": [
          "prime rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "Prime Rib",
        "dish_primary_category": "prime rib",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null
      },
      {
        "general_praise": false,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "This Prime Rib is the pipe hit. I recommend a side of biscuits to mop up the jus..What puts this over the top is the dust of Maldon Salt that they finish with..Pros pro move for sure\n\nThe music is great too",
        "source_created_at": "2024-10-11T17:09:21.000Z",
        "source_id": "t1_lrfu1bn",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfu1bn/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "biscuit"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "biscuits",
        "dish_primary_category": "biscuit",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "terrific",
          "house roasted"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "special",
          "friday"
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
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "josephine house",
        "restaurant_original_text": "Josephine House",
        "restaurant_temp_id": "rest_2",
        "source_content": "Josephine House’s steak night on Monday’s is fantastic",
        "source_created_at": "2024-10-11T17:16:35.000Z",
        "source_id": "t1_lrfvdnj",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfvdnj/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": [
          "fantastic"
        ],
        "dish_attributes_selective": [
          "steak night",
          "monday"
        ],
        "dish_categories": [
          "steak"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "steak night",
        "dish_primary_category": "steak",
        "dish_temp_id": "dish_2"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Days",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "house roasted",
          "10 oz"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "special"
        ],
        "dish_categories": [
          "beef rib",
          "rib",
          "beef"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "beef rib"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "tumble 22",
        "restaurant_original_text": "Tumble 22",
        "restaurant_temp_id": "rest_tumble_22_t1_lrk5jkk",
        "source_content": "Tumble 22 happy hour sandwich + 1 side for ..$8?",
        "source_created_at": "2024-10-12T12:59:43.000Z",
        "source_id": "t1_lrk5jkk",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrk5jkk/",
        "temp_id": "mention_tumble_22_t1_lrk5jkk",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": [
          "happy hour"
        ],
        "dish_categories": [
          "sandwich",
          "side"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "happy hour sandwich + 1 side",
        "dish_primary_category": "sandwich",
        "dish_temp_id": "dish_sandwich_t1_lrk5jkk"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "Hands down it Maie Days prime rib special on Fridays 11-3. Both sides are terrific, if you opt in, and it’s a 10 oz house roasted beef rib for 19$ otherwise. Would gladly hear of others. ",
        "source_created_at": "2024-10-11T16:25:03.000Z",
        "source_id": "t3_1g1dspf",
        "source_type": "post",
        "source_ups": 345,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/",
        "temp_id": "mention_1",
        "dish_attributes_descriptive": [
          "house roasted"
        ],
        "dish_attributes_selective": [
          "prime rib",
          "10 oz"
        ],
        "dish_categories": [
          "beef rib",
          "rib"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "prime rib special",
        "dish_primary_category": "beef rib",
        "dish_temp_id": "dish_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "super burrito",
        "restaurant_original_text": "super burrito",
        "restaurant_temp_id": "rest_2",
        "source_content": "super burrito on tuesdays ",
        "source_created_at": "2024-10-12T17:17:24.000Z",
        "source_id": "t1_lrlcqf1",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrlcqf1/",
        "temp_id": "mention_2",
        "dish_attributes_descriptive": null,
        "dish_attributes_selective": null,
        "dish_categories": [
          "burrito"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "super burrito",
        "dish_primary_category": "burrito",
        "dish_temp_id": "dish_2"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "eurasia",
        "restaurant_original_text": "Eurasia",
        "restaurant_temp_id": "rest_t1_lrol3qk_1",
        "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
        "source_created_at": "2024-10-13T06:07:01.000Z",
        "source_id": "t1_lrol3qk",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrol3qk/",
        "temp_id": "mention_t1_lrol3qk_1",
        "dish_categories": [
          "sushi roll",
          "sushi",
          "roll"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "sushi rolls",
        "dish_primary_category": "sushi roll",
        "dish_temp_id": "dish_t1_lrol3qk_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "eurasia",
        "restaurant_original_text": "Eurasia",
        "restaurant_temp_id": "rest_t1_lrol3qk_1",
        "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
        "source_created_at": "2024-10-13T06:07:01.000Z",
        "source_id": "t1_lrol3qk",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrol3qk/",
        "temp_id": "mention_t1_lrol3qk_2",
        "dish_categories": [
          "miso soup",
          "miso",
          "soup"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "miso soup",
        "dish_primary_category": "miso soup",
        "dish_temp_id": "dish_t1_lrol3qk_2"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "eurasia",
        "restaurant_original_text": "Eurasia",
        "restaurant_temp_id": "rest_t1_lrol3qk_1",
        "source_content": "Eurasia - 3 sushi rolls &amp; miso soup/salad for $18",
        "source_created_at": "2024-10-13T06:07:01.000Z",
        "source_id": "t1_lrol3qk",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrol3qk/",
        "temp_id": "mention_t1_lrol3qk_3",
        "dish_categories": [
          "salad"
        ],
        "dish_is_menu_item": true,
        "dish_original_text": "salad",
        "dish_primary_category": "salad",
        "dish_temp_id": "dish_t1_lrol3qk_3"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "maie day",
        "restaurant_original_text": "Maie Day",
        "restaurant_temp_id": "rest_1",
        "source_content": "Maie Day bitches",
        "source_created_at": "2024-10-12T01:44:28.000Z",
        "source_id": "t1_lri6vt6",
        "source_type": "comment",
        "source_ups": 0,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lri6vt6/",
        "temp_id": "mention_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "torchys",
        "restaurant_original_text": "Torchys",
        "restaurant_temp_id": "rest_1",
        "source_content": "Anything at Torchys",
        "source_created_at": "2024-10-12T05:36:43.000Z",
        "source_id": "t1_lriz3q0",
        "source_type": "comment",
        "source_ups": 0,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lriz3q0/",
        "temp_id": "mention_1"
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_1",
        "source_content": "Yes. I’m a ribeye steak guy and I’m not a pork chop guy. Except for Perry’s. I’ll take a Perry’s pork chop over almost any cut of beef",
        "source_created_at": "2024-10-11T19:56:30.000Z",
        "source_id": "t1_lrgogtu",
        "source_type": "comment",
        "source_ups": 17,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrgogtu/",
        "temp_id": "mention_1",
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_1",
        "source_content": "Exactly. Perry's pork chop is better than 90% of the steaks I've had in my life.",
        "source_created_at": "2024-10-12T15:48:12.000Z",
        "source_id": "t1_lrkwu2b",
        "source_type": "comment",
        "source_ups": 1,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrkwu2b/",
        "temp_id": "mention_2",
        "dish_is_menu_item": true,
        "dish_original_text": "pork chop",
        "dish_primary_category": "pork chop",
        "dish_temp_id": "dish_1",
        "restaurant_attributes": null
      },
      {
        "general_praise": true,
        "restaurant_normalized_name": "perry's",
        "restaurant_original_text": "Perry's",
        "restaurant_temp_id": "rest_1",
        "source_content": "I have had some dry ones on occasion as well. Unfortunately, the overall quality and experience at Perry's has declined even as the price has gone up. But it is still a pretty great lunch special.",
        "source_created_at": "2024-10-11T17:31:40.000Z",
        "source_id": "t1_lrfy6qi",
        "source_type": "comment",
        "source_ups": 11,
        "source_url": "https://reddit.com/r/austinfood/comments/1g1dspf/best_special_in_austin/lrfy6qi/",
        "temp_id": "mention_3",
        "dish_is_menu_item": true,
        "dish_original_text": "lunch special",
        "dish_primary_category": "special",
        "dish_temp_id": "dish_2",
        "restaurant_attributes": null
      }
    ]
  }
}