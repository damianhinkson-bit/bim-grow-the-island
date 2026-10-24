# Bim: Grow the Island — Design Doc

Version 0.3 · 24 Oct 2026 · Status: draft for Damian to review

This doc turns the Project instructions into concrete game rules. Anything marked **[check]** is a game value Damian should confirm from real farming experience. Anything marked **[decide]** is an open choice.

Changes in 0.3: multiplayer for up to 4 players, separate stockpiles with trading, and the move to GitHub.

---

## 1. Pitch

A mobile-first strategy game set on the real map of Barbados. You start with four workers in St. Michael and grow the island from scarcity to food security. You do it by farming real Bajan crops, building aquaponics that works like the real thing, and surviving hurricanes, droughts and green monkeys. Meanwhile AgroCorp tries to buy up the island with monoculture and imports.

Play alone, team up with up to 3 friends online against AgroCorp, or race each other to feed the island first.

**Win:** 6 of the 11 parishes are Food Secure and you have reached the Co-op Age.
**Lose:** AgroCorp controls 6 parishes, or 3 of your parishes collapse from hunger.

## 2. Design pillars

1. **Real farming, simplified, never fake.** Every mechanic should match how it works on a real farm, at a level a phone player can follow. If Damian would wince at it, it's wrong.
2. **Recognisably Bajan.** Real parishes, towns, crops, seasons and weather.
3. **Hopeful.** The story is the island feeding itself. History is the challenge the player recovers from, never something they profit from.
4. **One thumb, short sessions.** A full game takes about 25–30 minutes. Every action works with a tap or a drag.

## 3. Time and seasons

- **1 game month = 40 seconds.** A year is 8 minutes, so a full game covers about 3 years.
- **Dry season:** January–May. Lower water income, higher drought risk, the best time for leafy greens and tomatoes.
- **Wet season:** June–December. More rain in the cisterns, more fungal disease and insect pressure.
- **Hurricane season:** 1 June – 30 November, peaking August–October. Hurricanes only arrive in this window.
- The HUD shows the month and season, with an icon for "good planting time" for the crop you've selected.

## 4. Resources

The HUD keeps five stockpiles, so it stays readable on a phone:

| Resource | From | Used for |
|---|---|---|
| **Food** | Farms, trees, fish, aquaponics | Feeding parishes, training workers |
| **Water** | Springs, cisterns, rain | Crops, aquaponics top-up |
| **Coral stone** | Quarrying the coral cap | Buildings, liming acidic soil |
| **Bamboo** | Bamboo groves (gullies, Scotland District) | Shade houses, windbreaks, light structures |
| **BBD** | Co-op dues, market sales, hot pepper sauce | Seeds, equipment, solar, claiming land |

**Food groups.** Stored food is tracked by group, and parishes need a mix, not just calories:

- **Starch:** breadfruit, sweet potato, cassava, plantain
- **Greens:** pak choi, Manoa lettuce, kale
- **Protein:** flying fish, tilapia
- **Vegetables and spice:** tomato, hot pepper

## 5. Crops

Each farm plot holds one crop. Tapping a plot opens a crop picker that marks each crop as good, poor or off-season for the current month.

| Crop | Group | Best planting | Grow time (game) | Water | Notes |
|---|---|---|---|---|---|
| Sweet potato | Starch | Start of wet season | 4 months | Low | Drought tolerant, good first crop |
| Cassava | Starch | Any | 9 months | Very low | Survives hurricanes, roots are underground |
| Plantain | Starch | Wet season | 10 months | High | Blows over in hurricanes without a windbreak |
| Breadfruit tree | Starch | Plant once | 3 years to bear | Low | Heavy crop in summer, wild trees on the map |
| Pak choi | Greens | Dry season | 6 weeks | Medium | Suits aquaponics; caterpillar pressure |
| Manoa lettuce | Greens | Dry season | 6 weeks | Medium | Needs a shade house in the hot months; ideal for NFT |
| Kale | Greens | Dry season | 8–10 weeks | Medium | Hardier than lettuce |
| Tomato | Vegetables | Dry season | 3 months | Medium | Whitefly; rain causes blight |
| Hot pepper | Spice | Any | 3 months, then keeps bearing | Low | Sells well; unlocks pepper sauce at the market |

**[check]** All grow times, water needs and best planting months.

## 6. Soil and fertility

- Every farm plot has a **Soil** value from 0 to 100. Each harvest draws it down; how much depends on the crop.
- **Thermophilic composter:** takes crop waste and turns it into compost over about 3 game weeks. Spreading compost raises Soil.
- **Coral limestone:** liming a plot fixes acid clay soils, mostly in the Scotland District. It uses coral stone.
- **Mulch:** cuts a plot's water use and protects it in a drought.
- **Rotation bonus:** planting a different food group after the last harvest gives a yield bonus and fewer pests.
- **Regions differ.** The coral-cap lowlands have shallow soil and need compost. The Scotland District has clay that erodes on slopes unless it's terraced or under cover crops.

**[check]** Is liming the right real-world fix for Scotland District soils?

## 7. Aquaponics

An aquaponics system is one building with its own panel, showing three gauges and one control.

**The cycle:**
1. **Fish (tilapia)** eat feed and produce ammonia.
2. **Nitrifying bacteria** turn ammonia into nitrate. A new system starts with no bacteria and takes about 2 game weeks to "cycle up".
3. **Plants** in NFT or deep-water channels take up the nitrate and clean the water.
4. The clean water flows back to the fish.

**Player controls:** feed rate, stocking density, and how many channels to plant.

**What can go wrong:**
- Too much feed or too many fish: ammonia builds up faster than the bacteria can handle, fish get stressed and then die.
- Too few plants: nitrate builds up and the water quality drops.
- **Pump power:** the pump needs solar or grid power. During a hurricane outage, fish start dying after about 12 game hours unless there's a battery or a backup aerator.

**Rewards:**
- It uses very little water, just a top-up for evaporation, so it's the best way through a drought.
- Greens harvest continuously. Tilapia are ready after about 6 game months.

**[check]** Cycling time, outage tolerance, stocking numbers and harvest time.

## 8. Ages

| Age | Theme | Unlocks |
|---|---|---|
| 1. Foraging | Gather what the island offers | Huts, rain barrels, gathering breadfruit, fish and water |
| 2. Rain-fed Farming | Traditional kitchen gardens | Farm plots, chattel houses, cisterns, composters, the market |
| 3. Recovery | Repairing land worn out by the monoculture years | Liming, terracing, cover crops, crop rotation, the seed bank |
| 4. Sustainable Tech | Modern resilient farming | Shade houses, NFT and aquaponics, solar, drip irrigation, windbreaks, seawalls |
| 5. Co-op | Community food networks | Co-op markets, distribution hubs, cold storage. Reaching this age is required to win |

**How the Recovery Age handles history:** it opens with a short illustrated card about Barbados's sugar-cane monoculture years. The card shows how that history left depleted soils and an island dependent on imports, and it acknowledges the people who worked that land. Then the gameplay is entirely about restoring the land. There are no plantation mechanics and no reward for running a monoculture.

**[decide]** Five ages could make the game long. Ages 1 and 2 might be merged into a quicker opening.

## 9. Parishes and food security

This replaces the prototype's one-off "pay to feed a parish".

- Every parish has a **demand** for each food group, based on its population. Real population sizes are used, so St. Michael and Christ Church need more.
- A parish joins your co-op after you supply it for **one full season**, through a depot or market in it or in a neighbouring parish.
- Each parish shows a status badge:
  - **Hungry:** demand isn't met.
  - **Stable:** demand is met.
  - **Food Secure:** demand is met for all four food groups, plus 2 months of reserves in local storage.
- A parish that stays Hungry for 2 seasons **collapses**. It leaves your co-op and AgroCorp can take it cheaply.

## 10. Threats

**Hurricanes**
- They follow a forecast chain: tropical wave → storm → hurricane, giving 2–3 game days of warning. Categories run from 1 to 3.
- **Windbreaks** (bamboo or trees) protect crops nearby. **Hurricane straps** reinforce buildings. **Seawalls** protect coastal tiles from storm surge.
- **Emergency harvest:** when a hurricane is coming, you can pull in near-ready crops early at 60% of their yield.
- Hurricanes can cause power cuts, which matters for aquaponics.

**Droughts**
- They happen mostly in the dry season. Cisterns fall dry and springs run slow.
- Mulch, drip irrigation and aquaponics all soften the blow.

**Pests**
- **Green monkeys** live in the gullies and woodland and raid nearby fruit and vegetable plots. Fencing, netting and guard dogs help keep them out.
- **Insects:** whitefly on tomatoes and caterpillars on pak choi. Neem spray, beneficial insects and crop rotation reduce them.

**[check]** Which monkey deterrents actually work in Barbados?

## 11. AgroCorp

AgroCorp is a rival with distinct moves:

- **Buyouts:** it buys parishes with no co-op buildings in them, as in the prototype.
- **Import dumping:** it floods one food group with cheap imports for a season, so your market price for that group drops.
- **Water rights:** it claims a spring, cutting that spring's output for everyone else.
- **Chemical runoff:** its farms grow fast, but soil and reef quality fall in the parishes next to them.

**Player counters:** a co-op market brand ("Grown in Bim") that resists import dumping, buying back water rights, and reef and soil restoration.

## 12. Controls and UI

- Tap a worker, then tap a target. **Drag a building from the build menu onto the map**, with a ghost preview showing whether the spot is valid.
- A bottom sheet holds the selected thing's details and actions. Buttons stay large and thumb-reachable.
- Parish badges and the season are always visible.
- There is a short guided tutorial for the first 3 minutes.

## 13. Art direction

- **View:** top-down with slightly angled buildings, like the current prototype but illustrated rather than flat shapes.
- **Palette:** natural island greens, sand and turquoise for the world. The UI uses the flag's ultramarine and gold.
- **Asset list:**
  - about 15 buildings, each with build and damaged states
  - 9 crops, each at 3 growth stages
  - 4 resource nodes
  - workers with carrying animations, plus a monkey
  - weather effects
- In multiplayer, each co-op needs its own colour (4 distinct player colours) that reads clearly against AgroCorp's red.
- **References:** photos from Damian's farm and aquaponics setup, chattel houses, and real Bajan crops.

## 14. Multiplayer

Up to **4 players** online, alongside single-player:

| Mode | Players | Goal |
|---|---|---|
| **Co-op vs AgroCorp** | 2–4 players on one team | Together, make 6 parishes Food Secure before AgroCorp takes 6 |
| **Versus** | 2–4 rival co-ops, with AgroCorp as an extra side | First co-op to its target of Food Secure parishes wins |

**Start parishes**, spread around the island, with AgroCorp always in St. Lucy:

| Players | Start parishes |
|---|---|
| 1 | St. Michael |
| 2 | St. Michael, St. Philip |
| 3 | St. Michael, St. Philip, St. Andrew |
| 4 | St. Michael, St. Philip, St. Andrew, St. James |

**Every player keeps their own stockpiles** (decided). Each player has their own food, water, stone, bamboo and BBD, plus their own workers and buildings.
- **Trading:** a trade window lets any player offer resources to another, for example 50 greens for 40 stone. The other player accepts or declines.
- **Gifts:** in co-op, you can send resources to a teammate with no trade back.
- A quick-ping button marks a spot on the map ("help here", "hurricane coming", "build a seawall").

**Co-op rules**
- Parishes a team member feeds count for the whole team.
- AgroCorp gets stronger with more players: it earns faster and makes more moves, so 4 players still feel pressure.

**Versus rules**
- Players compete for the same unclaimed parishes, springs and markets. There is no combat. You win land by feeding people better.
- Players can take over each other's parishes when one goes Hungry, so neglect is punished.
- Trading still works, so a rival can also be a trading partner.
- **Win target:** 6 parishes in a 2-player game. With 3–4 players there aren't enough parishes for everyone to reach 6, so the target drops to 4, and a timer gives the win to whoever holds the most. **[decide]** Tune this in playtests.

**How it works technically**
- **Rooms by invite code.** One player creates a game and shares a 5-letter code or link, and the friend joins. No accounts are needed at first.
- **A server runs the game.** Both phones send commands like "worker 3 gathers this tree" to the server. The server runs the simulation and sends the state back to both. This keeps the two games in sync and stops cheating.
- **The game logic is split from the drawing.** The same simulation code runs on the server for online games and in the browser for single-player.
- **Disconnects:** a player who drops out has 2 minutes to rejoin before the AI takes over their co-op.
- **Pausing:** either player can pause up to 3 times per game.
- **Hosting:** the Bluehost plan can serve the game files, but it can't run a game server. That needs a small server service, roughly 5–10 USD a month. Candidates are Fly.io, Railway or Cloudflare. **[decide]** at build time.

**What this changes in the build**
- The game moves out of the single-file prototype into a GitHub repo, with the game logic, the drawing and the server as separate parts.
- Multiplayer gets built **early**, straight after the move. Every later feature (crops, aquaponics, hurricanes) is then built multiplayer-ready from the start, because adding multiplayer to a finished game is far harder.

## 14b. Decisions since v0.3

- **Seaport and airport are shared landmarks.** Any player whose land connects to them by road can use them; whoever holds that parish collects a small fee on each shipment.
- **Roads in gameplay:** workers move twice as fast on roads, deliveries to parishes travel by road, and players can build their own road tiles.
- **Player dashboard approved:** stockpiles with income rates, parish status badges, worker summary, threats, AgroCorp progress, and in multiplayer the other players and trade offers.
- **AgroCorp difficulty (Easy / Normal / Hard),** chosen on the start screen. It waits out a grace period (6 / 4 / 2 minutes), only buys parishes next to its own land, and announces its target before buying.
- **Money:** start with 100 BBD; co-op dues are 0.5 BBD/s per parish; a roadside stall at the Town Centre sells 50 food for 20 BBD at any time; the Market costs 80 stone and gives better prices. Tapping the BBD counter explains all of this in the game.

- **Food upkeep:** every worker eats 6 food a minute. When the stockpile can't cover it, all that player's workers work at half speed until food comes in. (This is the first step toward parish demand in section 9.)
- **Dashboard built:** opened from the bottom bar. It shows food in and out with how long the stock lasts, stockpiles with per-minute rates, housing, worker jobs, resources left on your land, buildings, parish protection, AgroCorp's next target and upcoming threats.

- **Roads, port and airport built.** Highways are road tiles; workers move twice as fast on them and route along them. Players lay road tiles in their own parishes by dragging (5 coral stone each). Bridgetown Port (St. Michael): export 100 food for 60 BBD or 100 stone for 50, import 100 food for 80 or 100 water for 40, up to 3 fishing boats (60 stone + 40 BBD, 24 food/min each, can sink in hurricanes), and a relief ship with 80 food after each hurricane. Grantley Adams Airport (Christ Church): air-freight 50 food for 45 BBD, tourism worth 18 BBD/min to the parish holder, closed from the hurricane warning until the storm passes. A player can trade only once their Town Centre, a Depot or a Market connects to the landmark by road; the parish holder takes 10% of each deal's BBD, including AgroCorp.

## 15. Build plan

1. ✅ **Real map:** coastline, parishes, terrain and towns.
2. **Foundation:** move to a GitHub repo and split the game logic from the drawing. Everything a player does becomes a command, so the same game runs on a phone or on a server.
3. **Multiplayer prototype:** rooms for up to 4 players with invite codes, a hosted server, trading, and Co-op vs AgroCorp on today's gameplay.
4. **Seasons and crops:** the calendar, crop picker and soil.
5. **Parish food security:** demand, supply routes and status badges.
6. **Aquaponics system.**
7. **Threats upgrade:** the hurricane forecast chain, monkeys and insects.
8. **Ages, AgroCorp moves, and Versus mode.**
9. **Art and sound pass.**
10. **Tutorial, save game and balance.**

## 16. Open questions for Damian

1. Please check all the crop, soil and aquaponics values marked **[check]**.
2. Should the game have 5 ages, or merge the first two?
3. Should the text use Bajan dialect, for example in event cards ("Wunna crops looking sweet!")?
4. Is this a free brand piece for Damian Grows, or something to sell later? That affects art budget and hosting.
5. Is a game length of about 25–30 minutes right?

Decided: separate stockpiles with trading; up to 4 players; the project moves to the GitHub repo `bim-grow-the-island`.

---

*Map data: parish borders from geoBoundaries / Wikimedia Commons (CC BY 2.5).*
