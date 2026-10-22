# Game design: Stickman Ruins

Decided by the boss through 22 questions.

## Big idea
- An abandoned island of **ruins** where stickmen fight.
- **One online server** that is always running. Players drop in and out anytime.
- **Solo only:** everyone against everyone. No teams, no chat.
- For **kids**: no blood. Knocked-out players disappear in a puff.

## Main menu
- **Join Arena:** jump into the running match.
- **Shop:** buy skins and weapons with coins.

## Fighting
- **Weapons** come from the boss's cards (`docs/design/`), nothing else (#26):

  | Weapon | Kind | Damage | Wait | Uses | Chest | Price | Rarity | Special |
  |---|---|---|---|---|---|---|---|---|
  | **Gun** | gun | 2 | 2 s | 15 shots | 15 | 3 | Common | the starting weapon |
  | **Shootbm** | long gun, 1 bullet | 5 | 3 s | 20 shots | 15 | 7 | Common | – |
  | **Electric Sword** | sword | 15 | 2 s | 50 hits | 5 | 30 | Epic | **Shock:** the hit player loses 1 H.P every 5 s for 15 s |
  | **Ice Sword** | sword | 10 | 3 s | 50 hits | 4 | 35 | Epic | **Freeze:** the hit player is completely stuck for 2 s |
  | **Shield** | shield | – | – | 60 blocks | 6 | 25 | Epic | blocks hits from the front |
  | **DM Gun** | long gun, 1 bullet | 15 | 3 s | 30 shots | 7 | 20 | Epic | – (#32) |
  | **Supergun** | revolver, 1 bullet | 25 | 2 s | 30 shots | 1.5 | 70 | Legendary | – (#32) |
  | **Mega Shield** | shield | – | – | 70 blocks | 1 | 100 | Legendary | blocks, and sends 25% of the blocked damage back |
  | **Supersword** | sword | knockout | 1.5 s | 40 hits | 0.3 | 250 | Megalegend | any hit knocks out at once; costs a raised shield 5 blocks |

- Everyone starts with **the Gun**, finds better weapons in chests, or buys them in the shop.
- **Shock (Electric Sword):** after the hit, 1 H.P is lost at 5 s, 10 s and 15 s (3 more). A new hit starts it over.
- **Freeze (Ice Sword):** for 2 s you cannot move, turn, shoot, hit, switch weapons or raise your shield.
  You turn ice-blue inside an ice block.
- **Shields** are worn on your **other arm**, never in a weapon slot. You wear one shield at a time.
  - **Hold Shift** (computer) or **hold the 🛡️ button** (phone) to raise it. While it is up you cannot shoot or hit.
  - A raised shield blocks hits from the **front** (the half you are looking at): 0 damage, no shock or freeze,
    and the shield loses 1 block (5 for the Supersword). At 0 it breaks and disappears.
  - The **Mega Shield** also sends 25% of the blocked damage back to the attacker (25 for a Supersword hit).
  - **Which shield do you wear?** Joining: your best (most expensive) shield from the backpack comes with you,
    other shields stay in the backpack. Walking over a shield: you pick it up if you wear none, or if it is
    rarer than yours (Mega Shield over Shield): then your old one drops on the ground. Otherwise it stays there.
    Leaving alive puts your shield back in the backpack; when you are knocked out it drops like your weapons.
- **The Gun** (starting weapon): a pistol. Damage 2, one shot every 2 seconds, 15 shots, Common, costs 3 coins,
  15% chance to come out of a chest. You get one free every time you join (slot 1), then your backpack weapons.
  A bought Gun goes into the backpack like any other weapon and comes with you in slot 2.
- **Rarities** (weakest to strongest), each with its own color everywhere in the game (shop, HUD slots, rings on the ground):
  - 🟩 **Common** = green (Gun, Shootbm, Bomb)
  - 🟪 **Epic** = purple (DM Gun, Electric Sword, Ice Sword, Shield)
  - 🟨 **Legendary** = yellow (Supergun, Mega Shield, Legendary Bomb)
  - 🟦⬛ **Megalegend** = blue + black (Supersword)
- **Copies:** you can carry the same weapon more than once (for example 2 Guns, or 2 Ice Swords), each copy in its
  own slot with its own durability. When you join you get the free Gun in slot 1, then your backpack weapons,
  most expensive first (copies too), up to 5 slots. You can pick up a weapon you already have if a slot is free.
  When you leave alive, every weapon except the free Gun goes back into your backpack.
- **Durability:** every weapon wears out a little each time you use it: each shot, each sword hit on a player or a
  raised shield (a swing that hits only air costs nothing, #34), and a shield each time it blocks.
- **Drop weapon (#34):** press **G** (computer) or the small **⬇️** button next to the slots (phone) to drop the weapon
  in your hand. It keeps exactly the durability it has, and anyone can pick it up (you too, after stepping away).
  The free Gun can be dropped too.
  When it reaches 0 it **breaks and disappears** from your inventory. There is no repair.
  The Gun breaks too: then you may have **no weapon at all** until you find or pick one up.
- **Health:** the **Healing Potion** is the only heal (no bandages, no medkits).
  - Drinking takes **5 seconds** (a ring fills up) and gives **full H.P**.
  - Moving or getting hit does **not** stop it. Switching to a weapon before the 5 s are done **cancels** it and the potion is **wasted**.
  - Carry **max 3** potions (a counter next to the H.P bar, not a weapon slot). Phone: tap the potion button; computer: **Q**.
  - Shop: **10 coins**, Common (green). Bought potions wait in the backpack and come into the arena with you (up to 3);
    leave alive and the unused ones go back. Knocked out: your potions drop on the ground.

- **Bombs (#32)** are thrown, not held: like potions they are a **counter** (not a weapon slot), shown as small
  bomb buttons with their count next to the shield pill. **B** throws a Bomb, **N** a Legendary Bomb (phone: tap the bomb button).
  The bomb lands where you aim (at most its max throw away). As soon as it lands a **red square** shows the area on the
  ground, and **3 s after the throw** it explodes: everyone inside the square gets its damage. A raised shield does **not** block it.

  | Bomb | Damage | Area | Max throw | Hurts the thrower? | Carry max | Chest | Price | Rarity |
  |---|---|---|---|---|---|---|---|---|
  | **Bomb** (round, black) | 3 | 2×2 m | 7 m | yes | 5 | 10 | 3 coins for 1 | Common |
  | **Legendary Bomb** (round, gold) | 10 | 5×5 m | 15 m | no | 3 | 2 | 60 coins for a pack of 3 | Legendary |

  Bought bombs wait in the backpack and come into the arena like potions (up to the max); leave alive and the rest go back.
  The chest number of a bomb is a **percent**: next to its weapon, every chest also drops a Bomb 10% of the time and a pack of
  3 Legendary Bombs 2% of the time (like the extra potion). You pick up as many as fit; the rest of a pack stays on the ground.
  Knocked out: your bombs drop too.

## When you get knocked out
- You drop every weapon you carry, **including bought ones, the Gun and your shield**. Anyone can pick them up.
- **Dropped weapons rule:** a picked-up weapon with **more than half** of its uses left keeps them.
  With **half or less**, it is set to **half** (rounded up). Example: a Gun (15 shots) with 3 shots left comes back with 8.
  Weapons from chests are always full.
- You go back to the main menu.

## Chests and coins
- Coins only come from **chests**.
- Chests are always in the **same spots**. Each one comes back **2 minutes** after it's opened.
- Every normal chest gives **3 coins** and **exactly one weapon**, and **15%** of the time an **extra Healing Potion** next to it
  (picked up like other items, only if you have fewer than 3).
- **Which weapon?** Every weapon card has a **chest number** (the "%" on the card). A chest always gives
  **exactly one** weapon (shields count as weapons here). The numbers are like tickets in a hat: a weapon with
  15 has 15 tickets, one with 1 has 1 ticket, and the chest pulls one ticket. The numbers do **not** have to
  add up to 100. Today: Gun 15, Shootbm 15, DM Gun 7, Shield 6, Electric Sword 5, Ice Sword 4, Supergun 1.5, Mega Shield 1,
  Supersword 0.3 (together 54.8). So the real chance of a Gun is 15 ÷ 54.8 ≈ 27 out of 100 chests,
  and of the Supersword 0.3 ÷ 54.8 ≈ 5 out of 1000 chests.
  (Formula: chance of a weapon = its number ÷ the sum of all numbers.)
- ⭐ **Golden chest:** every few minutes a golden chest appears and everyone races to it.
  It gives **10 coins** and **one weapon**, picked like a normal chest but the numbers of
  **Epic, Legendary and Megalegend weapons count double** (Common stays the same), so rare weapons come out more often.
  It also gives an extra Healing Potion 15% of the time, like a normal chest.

## Moving and controls
- Walk, run, jump, slide and crouch. No climbing, no vehicles.
- **Phone:** joystick on the left, buttons on the right, you aim yourself. Hold 🛡️ to raise your shield.
- **Computer:** WASD to move, mouse to aim and shoot, **hold Shift to raise your shield**.

## Look
- **Camera:** behind your character, like Fortnite.
- **Characters:** stickmen with clean, sharp graphics.
- **Skins:** colors and patterns, plus outfits (hats, masks, capes, clothes).
- **Map:** a big island of ruins with buildings, towers and hiding spots, for up to 100 players.

## Other
- **Platform:** phones (runs in the phone's browser).
- **Accounts:** saved, so you keep your coins and skins.
- **Goal:** just for fun, to play with friends.
