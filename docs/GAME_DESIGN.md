# Game design: PvP Island

Decided by the boss through 22 questions.

## Big idea
- The game is called **PvP Island** (the boss named it).
- An abandoned island of **ruins** where stickmen fight.
- **One online server** that is always running. Players drop in and out anytime.
- **Solo only:** everyone against everyone. No teams, no chat.
- For **kids**: no blood. Knocked-out players disappear in a puff.

## Main menu
- **Join Arena:** jump into the running match.
- **Shop:** buy skins and weapons with coins.
- **🎒 Inventory (#39, #50):** everything you bought or brought back waits here, safe. Below it are two bars, and
  **only the two bars come into the arena**:
  - the **fast bar**: 5 slots for **hand weapons** only (swords and guns). Tap a weapon to put it in the first free slot
    (or tap an empty slot first, then the weapon). No weapon in the fast bar: you get the free Gun.
  - the **extras bar**: 4 fixed spaces, each showing a faint drawing of what goes there:
    🛡️ **Shield** (one shield: Shield or Mega Shield), 🧪 **Healing Potions** (up to 3), 💣 **Bombs** (up to 5) and
    💥 **Legendary Bombs** (up to 3). Tapping a potion or bomb **fills its space with one tap** (as many as fit), so a kid
    does not have to tap 5 times; tap the space to put them all back.
  - Tap anything in a bar to put it back into the Inventory. Leave the arena alive and what is left goes back into the
    same slot or space; get knocked out and you lose only what was in the bars.
  - **🗑️ Trash (#53):** a small 🗑️ TRASH button in the top corner. Tap it (it turns red: "Tap an item to destroy it";
    tap 🗑️ again to cancel), then tap an item in the Inventory or in a bar. A box asks **"Are you sure you want to
    destroy this weapon?"** (for a shield, potion or bomb it says its name, like "this Healing Potion") with its picture.
    **YES** (red) destroys **one** (one copy, or one of a stack) forever, **no coins back**; **NO** keeps it. Either way
    trash mode turns off. The server checks it (you must own it; not while you are in the arena), and a worn weapon is
    destroyed as exactly that copy. The free starting Gun is never in the Inventory (it stays in the arena), so it cannot
    be trashed and you always get it again when your fast bar is empty; a **bought** Gun can be trashed like any weapon.
- **🏆 Ranking (#47):** the **top 50 players** with the most **knockouts** (not coins). 🥇🥈🥉 for the first three,
  your own row in gold, and if you are not in the top 50 your place is shown at the bottom.
  - Every time you knock out another player, your account gets **+1 knockout** (saved). Your own bomb does not count.
    In practice mode your knockouts count too; the bots are not in the ranking.
  - The same number of knockouts: whoever got there **first** ranks higher. Players with 0 knockouts are not listed.

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
- **Charging (#38):** after you use a weapon it **charges** for its **Wait** time ("Charging 1.4s" under the crosshair).
  - Each weapon charges **on its own**: while one charges, switch to another weapon and use it right away.
    Two copies of the same weapon charge separately too. A weapon you drop and pick up again is ready.
  - You **can** attack with a weapon that is still charging, but it only does **25%** of its damage
    (rounded, at least 1) and **no special**: no shock, no freeze, no knockout (a charging Supersword hit does 25).
    A small **"25%"** shows next to "Charging". It still uses durability and starts the charge over.
  - A sword swing that hits only **air** does not start the charge (and costs no durability).
  - Tapping super fast does not help: at most one attack every **0.15 s**.
  - Holding the fire button attacks again only when the weapon is charged; a new tap always attacks.
  - The 25% is one number in the rules (`CHARGING_DAMAGE`), easy to change.
- **Headshots (#45):** a **gun** bullet that hits the **head** (the top 0.35 m of a player; a crouching player's
  head is lower too) does **3 more damage**: a Gun headshot does 2 + 3 = **5**, a DM Gun 15 + 3 = 18.
  - A weak shot while the gun is charging: first 25%, then + 3 (a charging DM Gun headshot: 4 + 3 = 7).
  - Swords, bombs and shock never headshot. A raised shield still blocks a headshot completely
    (a Mega Shield sends back 25% of the normal damage, without the + 3: the shield took the hit, not the head).
  - The number above the head is **orange** with **HEADSHOT** under it (e.g. "-5 HEADSHOT"), and the shooter's
    hit marker (the cross in the middle) is orange and bigger.
  - The + 3 and the head size are numbers in the rules (`HEADSHOT_BONUS`, `HEAD_ZONE`), easy to change.
- **Shock (Electric Sword):** after the hit, 1 H.P is lost at 5 s, 10 s and 15 s (3 more). A new hit starts it over.
- **Freeze (Ice Sword):** for 2 s you cannot move, turn, shoot, hit, switch weapons or raise your shield.
  You turn ice-blue inside an ice block.
- **Shields** are worn on your **other arm**, never in a weapon slot. You wear one shield at a time.
  - **Hold the right mouse button** (computer) or **hold the 🛡️ button** (phone) to raise it. While it is up you cannot shoot or hit.
  - A raised shield blocks hits from the **front** (the half you are looking at): 0 damage, no shock or freeze,
    and the shield loses 1 block (5 for the Supersword). At 0 it breaks and disappears.
  - The **Mega Shield** also sends 25% of the blocked damage back to the attacker (25 for a Supersword hit).
  - **Which shield do you wear?** Joining: the shield in the shield space of your extras bar comes with you,
    other shields stay in the Inventory. Walking over a shield: you pick it up if you wear none, or if it is
    rarer than yours (Mega Shield over Shield): then your old one drops on the ground. Otherwise it stays there.
    Leaving alive puts your shield back in its space; when you are knocked out it drops like your weapons.
- **The Gun** (starting weapon): a pistol. Damage 2, one shot every 2 seconds, 15 shots, Common, costs 3 coins,
  15% chance to come out of a chest. You get one free when your fast bar has no weapon.
  A bought Gun goes into the Inventory like any other weapon; put it in the fast bar to take it along.
- **Rarities** (weakest to strongest), each with its own color everywhere in the game (shop, HUD slots, rings on the ground):
  - 🟩 **Common** = green (Gun, Shootbm, Bomb)
  - 🟪 **Epic** = purple (DM Gun, Electric Sword, Ice Sword, Shield)
  - 🟨 **Legendary** = yellow (Supergun, Mega Shield, Legendary Bomb)
  - 🟦⬛ **Megalegend** = blue + black (Supersword)
- **Copies:** you can carry the same weapon more than once (for example 2 Guns, or 2 Ice Swords), each copy in its
  own slot with its own durability. When you join you get the weapons of your fast bar, in its order
  (copies too), up to 5 slots. You can pick up a weapon you already have if a slot is free.
  When you leave alive, every weapon except the free Gun goes back into your fast bar (or the Inventory).
- **Durability:** every weapon wears out a little each time you use it: each shot, each sword hit on a player or a
  raised shield (a swing that hits only air costs nothing, #34), and a shield each time it blocks.
  Going to the menu does **not** repair anything (#51): a worn weapon or shield keeps its uses left in your bars and
  Inventory (a small bar under it shows how much), and comes back into the arena just as worn.
- **Drop weapon (#34):** press **G** (computer) or the small **⬇️** button next to the slots (phone) to drop the weapon
  in your hand. It keeps exactly the durability it has, and anyone can pick it up (you too, after stepping away).
  The free Gun can be dropped too.
  When it reaches 0 it **breaks and disappears** from your inventory. There is no repair.
  The Gun breaks too: then you may have **no weapon at all** until you find or pick one up.
- **Health:** the **Healing Potion** is the only heal (no bandages, no medkits).
  - Drinking takes **5 seconds** (a ring fills up) and gives **full H.P**.
  - Moving or getting hit does **not** stop it. Switching to a weapon before the 5 s are done **cancels** it and the potion is **wasted**.
  - Carry **max 3** potions (a counter next to the H.P bar, not a weapon slot). Phone: tap the potion button; computer: **Q**.
  - Shop: **10 coins**, Common (green). Bought potions wait in the Inventory; the ones in the potion space of the extras bar come along (up to 3);
    leave alive and the unused ones go back. Knocked out: your potions drop on the ground.

- **Bombs (#32)** are thrown, not held: like potions they are a **counter** (not a weapon slot), shown as small
  bomb buttons with their count next to the shield pill. **B** throws a Bomb, **N** a Legendary Bomb (phone: tap the bomb button).
  The bomb lands where you aim (at most its max throw away). As soon as it lands a **red square** shows the area on the
  ground, and **3 s after the throw** it explodes: everyone inside the square gets its damage. A raised shield does **not** block it.

  | Bomb | Damage | Area | Max throw | Hurts the thrower? | Carry max | Chest | Price | Rarity |
  |---|---|---|---|---|---|---|---|---|
  | **Bomb** (round, black) | 3 | 2×2 m | 7 m | yes | 5 | 10 | 3 coins for 1 | Common |
  | **Legendary Bomb** (round, gold) | 10 | 5×5 m | 15 m | no | 3 | 2 | 60 coins for a pack of 3 | Legendary |

  Bought bombs wait in the Inventory; the ones in their extras space come along (up to the max); leave alive and the rest go back.
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
- A coin looks like the boss's drawing (`docs/design/coin.jpg`): yellow, almost square with slightly cut corners,
  a darker outline, a **P** on it and shiny sparkle lines. When a chest opens, a few of these coins jump out of it in 3D and fade.
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
- **Computer:** WASD to move, mouse to aim and shoot, **hold the right mouse button to raise your shield**
  (let go to lower it). The browser menu does not open on the game.
- **Aim (Shootbm and DM Gun only):** tap the 🎯 AIM button (phone) or press Shift (computer) to start aiming; it keeps
  aiming (the button glows and says **AIM ON**) until you tap / press Shift again. The camera zooms in (2x) with a round
  scope, your shots are much more accurate, and you walk slower. Not with the Gun or the Supergun.
  Aiming stops by itself when you switch weapons, your weapon breaks or you drop it, you leave the arena or get knocked
  out, or a new game starts. With the shield up, while drinking or frozen aiming is paused (no zoom) and comes back after.

## Look
- **Camera:** behind your character, like Fortnite.
- **Characters:** stickmen with clean, sharp graphics.
- **Skins:** colors and patterns, plus outfits (hats, masks, capes, clothes). Pattern prices (#44): Zebra Stripes 50 coins,
  Shiny Gold 75, Rainbow 100.
- **Map:** a big island of ruins with buildings, towers and hiding spots, for up to 100 players.

## Sounds (#55)
- **All made in code** (`@pvp/sound`, Web Audio): no sound files, nothing to download. Each play is a little
  different (seeded), so it never sounds like a robot.
- **Fight:** every gun has its own shot (Gun pop, Shootbm crack, DM Gun heavier, Supergun big blast). Sword swing
  whoosh and hit; the Ice Sword hit sounds icy, the Electric Sword zaps. Shield: a swoosh when you raise it, a clang
  when it blocks. A "ding" for a headshot, a small tick when your gun hits, an "oof" when you get hurt, a falling
  "bwoo" for a knockout, a crack when a weapon or shield breaks.
- **Bombs:** a whoosh when thrown, the fuse sizzles, then BOOM (the Legendary Bomb is bigger and deeper).
- **Loot:** chest creak, coins jingle, a fanfare for the golden chest (and a shimmer when it appears), potion gulps
  and a heal chime, a "blip" when you pick something up. Soft footsteps for your own player, faster when you run.
- **Menus:** a soft click on buttons, "ka-ching" when you buy.
- **3D:** other players' sounds come from where they are: quieter far away, left or right ear from the camera.
  Phones play at most 8 sounds at once (computers 16); the important ones (your own, headshots, booms) win.
- **No music** (the boss's choice).
- **Settings:** 🔊 in the menu top bar and a small 🔊 in the fight HUD mute / unmute; 🎚️ in the menu opens the
  Sounds volume slider. Saved in this browser. Sound starts on your first tap (browsers need that).

## Other
- **Platform:** phones (runs in the phone's browser).
- **Accounts:** saved, so you keep your coins and skins.
- **Account screen (#46):** always the first screen when you open PvP Island (also practice mode; a saved login does
  not skip it, only your last name is filled in, never the password). Top part "Log in": name + password, you keep
  everything. Below: "Create an account": a name, a password, and the same password again. Different passwords: "The
  passwords are not the same. Try again." Log out in the menu brings you back to the Account screen.
- **Names (#41):** 3 to 16 letters, numbers or `_`. The ✏️ button next to your name in the menu changes it. No swear
  words or slurs (also in tricky spellings like `B.A.D`, l33t or accents): "You can't use that name. Please pick a new
  name." No one can use the same name, also not a look-alike copy (`Bob`, `B0b`, `b_o_b`, `BOB` are the same name; `Bob1`
  and `Bob2` are different): "Someone already has that name. Please pick a new name." The server decides.
- **Goal:** just for fun, to play with friends.
