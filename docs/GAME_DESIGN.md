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
- **Melee:** swords, axes, spears, bats.
- **Guns:** the Gun, pistol, shotgun, rifle, sniper.
- **Explosives:** grenades, rocket launcher, mines.
- **Weapons:** everyone starts with **the Gun**, find better weapons in chests, or buy them in the shop.
- **The Gun** (starting weapon): a pistol. Damage 2, one shot every 2 seconds, 15 shots, Common, costs 3 coins,
  15% chance to come out of a chest. You get one free every time you join (slot 1), then your backpack weapons.
  A bought Gun goes into the backpack like any other weapon and comes with you in slot 2.
- **Rarities** (weakest to strongest), each with its own color everywhere in the game (shop, HUD slots, rings on the ground):
  - 🟩 **Common** = green (Gun, Sword, Bat, Pistol)
  - 🟪 **Epic** = purple (Spear, Axe, Shotgun, Rifle, Grenades)
  - 🟨 **Legendary** = yellow (Sniper, Rocket Launcher, Mines)
  - 🟦⬛ **Megalegend** = blue + black (none yet, coming with the next weapon cards)
- **Copies:** you can carry the same weapon more than once (for example 2 Guns, or 2 Shotguns), each copy in its
  own slot with its own durability. When you join you get the free Gun in slot 1, then your backpack weapons,
  most expensive first (copies too), up to 5 slots. You can pick up a weapon you already have if a slot is free.
  When you leave alive, every weapon except the free Gun goes back into your backpack.
- **Durability:** every weapon wears out a little each time you use it (each swing, shot, throw, rocket or mine).
  When it reaches 0 it **breaks and disappears** from your inventory. There is no repair.
  The Gun breaks too: then you may have **no weapon at all** until you find or pick one up.
- **Health:** heal only with bandages and medkits (for now chests give no heals; the boss decides later where they come from).

## When you get knocked out
- You drop every weapon you carry, **including bought ones and the Gun**. Anyone can pick them up.
- **Dropped weapons rule:** a picked-up weapon with **more than half** of its uses left keeps them.
  With **half or less**, it is set to **half** (rounded up). Example: a Gun (15 shots) with 3 shots left comes back with 8.
  Weapons from chests are always full.
- You go back to the main menu.

## Chests and coins
- Coins only come from **chests**.
- Chests are always in the **same spots**. Each one comes back **15 seconds** after it's opened.
- Every normal chest gives **3 coins** and **exactly one weapon** (no heals from chests for now).
- **Which weapon?** Every weapon has its own **chest chance** (in percent). All of them together make 100,
  so the chance is exactly the number: the Gun has 15, so 15 out of 100 chests give a Gun.
  Today: Gun 15, Sword 18, Bat 18, Pistol 17, Spear 5, Axe 5, Shotgun 6, Rifle 5, Grenades 6, Sniper 2, Rocket Launcher 1, Mines 2.
  (Formula: chance of a weapon = its number ÷ the sum of all numbers.)
- ⭐ **Golden chest:** every few minutes a golden chest appears and everyone races to it.
  It gives **10 coins** and **one weapon**, picked like a normal chest but the numbers of
  **Epic, Legendary and Megalegend weapons count double** (Common stays the same), so rare weapons come out more often.

## Moving and controls
- Walk, run, jump, slide and crouch. No climbing, no vehicles.
- **Phone:** joystick on the left, buttons on the right, you aim yourself.

## Look
- **Camera:** behind your character, like Fortnite.
- **Characters:** stickmen with clean, sharp graphics.
- **Skins:** colors and patterns, plus outfits (hats, masks, capes, clothes).
- **Map:** a big island of ruins with buildings, towers and hiding spots, for up to 100 players.

## Other
- **Platform:** phones (runs in the phone's browser).
- **Accounts:** saved, so you keep your coins and skins.
- **Goal:** just for fun, to play with friends.
