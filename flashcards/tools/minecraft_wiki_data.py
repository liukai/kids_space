"""Minecraft Wiki page titles and kid-friendly blurbs.

Source: https://minecraft.wiki (official Minecraft Wiki).
"""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path


_LINES = """
grass|Grass Block|A grass block is the green top of many hills and plains. Punch it or use a shovel to get dirt. Sheep often graze on grass, and it spreads to nearby dirt when there is enough light.
dirt|Dirt|Dirt is one of the easiest blocks to dig and you find it almost everywhere. Use it for simple building, farming paths, or turning into grass. It is not as strong as stone, but great for shaping the land.
stone|Stone|Stone is a tough gray block that appears underground and in mountains. Mine it with a pickaxe to get cobblestone for tools and builds. Stone caves often hide ores, mobs, and hidden rooms.
sand|Sand|Sand is a yellow block found in deserts, beaches, and near water. It falls when nothing supports it, so be careful building with it. Smelt sand in a furnace to make glass for windows.
gravel|Gravel|Gravel is a speckled block that also falls like sand. Mining it sometimes drops flint, which you need for arrows and flint and steel. You often see it in caves, cliffs, and cold biomes.
clay|Clay|Clay is a smooth gray block usually found under rivers and lakes. Smelt clay balls in a furnace to make bricks for fireplaces and fancy builds. It is softer than stone and easy to shovel.
brick|Bricks|Bricks are red building blocks made from smelted clay. They look neat on houses and cannot catch fire like wood. Stack them for strong walls with a classic Minecraft look.
obsidian|Obsidian|Obsidian is one of the hardest blocks in the game. It forms when flowing water touches a lava source block. You need a diamond or netherite pickaxe to mine it, and it is used for Nether portals and enchantment tables.
bedrock|Bedrock|Bedrock is the unbreakable block at the bottom of the world. No pickaxe can break it in survival mode. It marks the lowest limit of your world and keeps you from falling out.
cobblestone|Cobblestone|Cobblestone is rough stone you get when you mine normal stone. It is a starter material for furnaces, tools, and strong early bases. Many players use it for mob-proof walls because mobs cannot spawn on it.
plank|Planks|Planks are wooden blocks made from logs in a crafting grid. They are used in tons of recipes: sticks, doors, chests, and more. Different wood types make different colored planks.
ore|Ore|Ore blocks hold useful materials like coal, iron, gold, and diamond inside. Mine ore with the right pickaxe to collect the resource. Deeper underground usually means rarer and better ores.
emerald|Emerald|Emeralds are bright green gems used mainly for trading with villagers. Librarians and other villagers offer enchanted books, tools, and food for emeralds. You mine emerald ore in mountain biomes.
redstone|Redstone Dust|Redstone dust carries power between levers, buttons, and machines. It lets you build doors that open themselves, traps, farms, and clever contraptions. Learn redstone to automate your base.
copper|Copper Ingot|Copper ingots come from mining copper ore, often found in caves. Craft them into spyglasses, lightning rods, and decorative blocks. Over time, copper blocks turn green like real copper.
coal|Coal|Coal is black fuel dropped from coal ore or from mining with a pickaxe. Burn it in a furnace to smelt iron and cook food. It also crafts into torches, which light up dark places and reduce mob spawns.
iron|Iron Ingot|Iron ingots are made by smelting iron ore in a furnace. They are the backbone of strong tools, armor, buckets, and anvils. Iron gear is a big step up from stone for exploring and fighting.
gold|Gold Ingot|Gold ingots come from smelting gold ore, often found in badlands and deep caves. Gold tools mine fast but break quickly, so iron is usually better for work. Piglins love gold, and it is used in clocks and powered rails.
diamond|Diamond|Diamonds are rare blue-white gems found deep underground. Use them to craft some of the best tools, weapons, and armor before netherite. A diamond pickaxe can mine obsidian for Nether portals.
netherite|Netherite Ingot|Netherite ingots upgrade diamond gear on a smithing table to make it stronger and lava-proof. Getting netherite takes ancient debris from the Nether plus gold. It is top-tier gear for late-game adventures.
lava|Lava|Lava is a glowing orange liquid that flows like thick water and sets things on fire. It is common in the Nether and deep caves. Carry a bucket of water to turn lava into obsidian or cobblestone safely.
netherrack|Netherrack|Netherrack is crumbly red rock that covers most of the Nether. It burns forever if you light it with flint and steel. It is easy to mine but not great for building in the Overworld.
glowstone|Glowstone|Glowstone is a bright yellow block found hanging in Nether ceilings. Break it to get glowstone dust for potions and lamps. It gives off strong light without a torch.
wool|Wool|Wool is a soft block from sheep that comes in many colors. Use it for beds, banners, carpets, and cozy builds. Shearing sheep gives wool without hurting them if you have shears.
glass|Glass|Glass is a clear block made by smelting sand in a furnace. Light passes through it, so it is perfect for windows and greenhouses. Mobs cannot spawn on glass blocks.
ice|Ice|Ice forms on water in snowy biomes and makes you slide when you walk. It melts near torches, fire, or bright light. Packed ice and blue ice are even slipperier for fast paths.
snow|Snow|Snow covers the ground in cold biomes and falls during weather in those areas. Shovel it for snowballs or layer it for a winter look. Wolves and foxes feel at home in snowy places.
wood|Wood|Wood comes from tree logs and is one of the first materials you collect. Turn logs into planks, then into tools, sticks, and chests. Different trees give different wood colors and vibes.
tnt|TNT|TNT is an explosive block that detonates when powered by redstone or fire. Use it carefully for mining or clearing land—or pranks. Water can soften the blast and protect nearby blocks.
sponge|Sponge|Sponge soaks up water in a wide area when placed, which helps drain flooded builds. Wet sponge must be dried in a furnace before it works again. Find it in ocean monuments.
quartz|Nether Quartz|Nether quartz is a white mineral mined from Nether quartz ore. It crafts into decorative quartz blocks and is used in redstone comparators and observers. It adds a clean, modern look to builds.
lapis|Lapis Lazuli|Lapis lazuli is a blue mineral mined from lapis ore, often near diamond level. You need it on an enchantment table to roll enchantments on gear. It also dyes wool and glass blue.
prismarine|Prismarine|Prismarine is a sea-green block from ocean monuments guarded by guardians. It has a wet, tiled look great for underwater bases. Dark prismarine and bricks add variety.
sculk|Sculk|Sculk is a dark block found in the deep dark biome below Y=0. It spreads when vibrations happen nearby and can summon the warden if you are not careful. Sculk sensors detect movement for redstone.
zombie|Zombie|Zombies are green-armed undead mobs that chase players at night and in dark places. They burn in sunlight unless they wear a helmet or stand in shade. They sometimes drop rotten flesh, carrots, or potatoes.
skeleton|Skeleton|Skeletons are bony mobs that shoot arrows from far away. They burn in daylight like zombies. Their arrows can be picked up, and sometimes they drop bones for bonemeal or taming wolves.
spider|Spider|Spiders are big climbing mobs that jump at you in the dark. In daylight they usually stay neutral unless you attack first. They drop string, which you need for bows and fishing rods.
creeper|Creeper|Creepers are silent green mobs that hiss and explode when they get close. Their blast can wreck builds and drain your health fast. Kill them from a distance with a bow, or trick them into useful crater mining.
enderman|Enderman|Endermen are tall black mobs with glowing purple eyes that teleport when hit or looked at. Staring at their face makes them angry unless you wear a pumpkin on your head. They pick up and move blocks, and drop ender pearls.
villager|Villager|Villagers are friendly NPCs who live in villages and work at job blocks like lecterns and blast furnaces. Trade emeralds for enchanted books, food, tools, and more. Protect them from zombies so the village thrives.
piglin|Piglin|Piglins are Nether humanoids who barter if you wear gold armor and do not open their chests uninvited. Toss gold ingots on the ground to see what they give back. Attack them and nearby piglins will fight back hard.
ghast|Ghast|Ghasts are huge floating white mobs in the Nether that shoot explosive fireballs. Their cries echo across lava lakes. Reflect fireballs with a sword swing, or snipe them with a bow for ghast tears.
blaze|Blaze|Blazes fly and shoot fire in Nether fortresses. Their blaze rods are needed for brewing stands and eyes of ender. Bring fire resistance potions and shield blocks when hunting them.
slime|Slime|Slimes are bouncy green cubes that split into smaller slimes when defeated. They spawn in swamps and in slime chunks underground. Tiny slimes are harmless and drop slimeballs for sticky pistons and leads.
wolf|Wolf|Wolves spawn in forests and can be tamed with bones to become loyal dogs. Tamed wolves follow you and attack what you attack. Feed them meat to heal them after fights.
chicken|Chicken|Chickens lay eggs over time and drop feathers when defeated. Breed them with seeds for a steady food and egg supply. Eggs can be thrown to sometimes hatch more chickens.
dragon|Ender Dragon|The Ender Dragon is the giant boss of the End dimension. Destroy the end crystals on obsidian pillars first, or they heal the dragon. Beating it opens the exit portal and completes a major Minecraft milestone.
wither|Wither|The Wither is a three-headed boss you summon with soul sand and wither skulls. It flies, shoots skulls, and breaks blocks around it. Defeating it drops a nether star for beacons.
guardian|Guardian|Guardians are spiky fishlike mobs that guard ocean monuments with laser beams. They swim fast and thorns hurt melee attackers. Elder guardians give mining fatigue until you clear the monument.
phantom|Phantom|Phantoms are flying undead mobs that appear when you skip sleeping for several nights. They swoop down and attack from the sky. Sleep in a bed, or fight them with a bow under cover.
drowned|Drowned|Drowned are underwater zombies found in oceans, rivers, and ruins. Some carry tridents, which are powerful thrown weapons. They convert from zombies that stay submerged too long.
husk|Husk|Husks are desert zombies with tan wraps that do not burn in the sun. Their hits can give you hunger, making food drain faster. They drop rotten flesh like normal zombies.
stray|Stray|Strays are skeletons found in snowy biomes with tattered cloaks. Their arrows apply slowness, making escape harder. They burn in sunlight like other undead archers.
ocelot|Ocelot|Ocelots are quick jungle cats that used to scare creepers and could be tamed with fish. Today cats spawn in villages, but ocelots still prowl jungles as shy, colorful mobs.
panda|Pandas|Pandas live in bamboo jungles with different personalities: playful, lazy, worried, or aggressive. Feed them bamboo to breed baby pandas. They roll, sneeze, and make bamboo forests feel alive.
axolotl|Axolotl|Axolotls are cute pink, gold, or blue water mobs found in lush caves. They help fight drowned and guardians underwater and play dead to heal. Catch them in a bucket to move them safely.
warden|Warden|The warden is a blind, massive mob in the deep dark that listens for vibrations. It hits harder than almost anything else in survival. Sneak, use wool to muffle steps, and avoid triggering sculk shriekers.
allay|Allay|Allays are small blue flying helpers that pick up matching items nearby and bring them to you. Give them an item to set what they collect. They love music and note blocks.
dolphin|Dolphin|Dolphins swim in warm oceans and grant a speed boost if you sprint-swim near them. Feed them raw cod or salmon and they may lead you to shipwrecks or ruins. They are playful but need water to live.
squid|Squid|Squids are peaceful ocean mobs that squirt ink clouds when hurt. Ink sacs dye wool black and craft books and quills. Glow squids glow in dark water and drop glow ink.
turtle|Turtle|Turtles spawn on beaches and lay eggs in sand that hatch into baby turtles. Scute from grown turtles crafts into a turtle shell helmet for extra underwater breath. Protect eggs from zombies that stomp them.
llama|Llama|Llamas carry chests when tamed and form caravans when leashed together. They spit at hostile mobs and players who annoy them. Find them in savannas and mountains with colorful carpets.
camel|Camel|Camels are tall desert mobs that can seat two players and dash forward with a long cooldown. They avoid walking into cactus and fit the desert vibe. Use them to cross hot sandy biomes faster.
sniffer|Sniffer|Sniffers are ancient mob eggs you hatch from suspicious sand or gravel. They sniff the ground and dig up torchflower seeds and pitcher pods. They bring old plants back to your world.
sword|Sword|Swords are melee weapons for fighting mobs and players up close. Higher tiers like iron and diamond deal more damage per swing. Sweep attacks hit groups when you stand still and strike.
pickaxe|Pickaxe|Pickaxes mine stone, ores, and metal blocks faster than bare hands. You need the right tier: stone for iron, iron for diamond, diamond for obsidian. A good pickaxe is essential for mining trips.
axe|Axe|Axes chop logs and wooden blocks much faster than other tools. They also deal extra damage in combat, especially against shields. Netherite and diamond axes cut trees quickly.
shovel|Shovel|Shovels dig dirt, sand, gravel, and snow faster than other tools. They are great for landscaping, gardening, and clearing paths. Some enchantments like Efficiency make them feel instant.
hoe|Hoe|Hoes turn dirt and grass into farmland for wheat, carrots, potatoes, and more. Right-click soil near water to prepare fields. They can also break leaves and hay quickly in a pinch.
bow|Bow|Bows shoot arrows for safe ranged combat and hunting. Charge the bow longer for stronger, straighter shots. Enchantments like Power and Infinity make archery even deadlier.
arrow|Arrow|Arrows are ammo for bows and crossbows. Craft them with flint, sticks, and feathers, or pick them up from skeletons. tipped arrows add potion effects on hit.
shield|Shield|Shields block incoming arrows and melee hits when you raise them. They can deflect ghast fireballs with good timing. Axes disable shields briefly on impact.
armor|Armor|Armor is worn in four slots to reduce damage from mobs, falls, and lava. Leather, iron, diamond, and netherite each protect more than the last. Enchant with Protection or Fire Protection for tough trips.
helmet|Helmet|Helmets protect your head and can carry respiration for longer underwater breathing. A turtle shell helmet gives extra water time. Some helmets, like carved pumpkins, have special effects.
chestplate|Chestplate|Chestplates cover your torso and give the biggest armor points of the four pieces. Iron and diamond chestplates are classic survival goals. Elytra replaces the chest slot when you want to glide.
leggings|Leggings|Leggings protect your legs and complete your armor set bonus. They craft from the same materials as other armor pieces. Swift Sneak on leggings helps you move quietly in the deep dark.
boots|Boots|Boots protect your feet and can have Feather Falling to reduce fall damage. Frost Walker freezes water under your steps. Soul Speed helps you sprint on soul sand in the Nether.
torch|Torch|Torches are cheap light sources made from coal and sticks. Place them on walls and floors to stop most mobs from spawning nearby. They also melt snow and ice a little around them.
lantern|Lantern|Lanterns are brighter hanging lights made from torches and iron nuggets. Place them on blocks or chains for stylish lighting. They work underwater unlike torches.
bucket|Bucket|Buckets hold water, lava, milk, fish, axolotls, and powder snow. Water buckets put out fire and make safe obsidian farms. Milk clears all potion effects when you drink it.
flint|Flint|Flint sometimes drops when you break gravel with a shovel. Combine it with iron and steel to relight Nether portals and campfires. It is also part of every arrow recipe.
shears|Shears|Shears harvest wool from sheep without killing them and collect leaves, vines, and honeycomb. They remove pumpkin faces and carve them too. Keep a pair for farming and decorating.
saddle|Saddle|Saddles let you ride horses, pigs, striders, and other mobs, but you cannot craft them—they are found in chests. Pigs need a carrot on a stick to steer. Horses need taming with empty hand clicks.
lead|Lead|Leads rope mobs and animals so you can pull them along. Tie the other end to a fence post to keep pets safe. Balloon-loving mobs like llamas work great with leads.
minecart|Minecart|Minecarts roll on rails for fast travel through mines and bases. Power them with powered rails or push them by hand. Chest and hopper minecarts carry items along tracks.
chest|Chest|Chests store up to 27 stacks of items and are craftable early from planks. Pair two chests side by side for a double chest with more space. Lock them with cats nearby—or hide valuables in secret rooms.
furnace|Furnace|Furnaces smelt ore into ingots and cook raw food with coal or wood as fuel. Every survival base needs one—or several. Blast furnaces smelt ore faster; smokers cook food faster.
anvil|Anvil|Anvils combine enchanted books with tools, repair gear with materials, and rename items. Each use costs experience and eventually wears the anvil down. They need iron blocks to craft.
piston|Piston|Pistons push blocks when powered by redstone, great for secret doors and farms. Sticky pistons pull blocks back when the signal turns off. Observers and slime blocks enable flying machines.
dispenser|Dispenser|Dispensers shoot items like arrows, eggs, and water buckets when powered. Use them in traps, minigames, and automated farms. They differ from droppers, which spit items without launching.
hopper|Hopper|Hoppers suck items from above and deposit them into chests or furnaces below. Point them with the sneak-place trick to route items sideways. They are the backbone of auto smelters and sorters.
lever|Lever|Levers stay on or off like a light switch for redstone power. Flip one to open a door permanently until you flip it back. They give a strong signal strength of 15.
button|Button|Buttons send a short redstone pulse when pressed, perfect for doorbells and timed traps. Wooden buttons last longer than stone ones. Arrows and thrown items can also trigger wooden buttons.
rail|Rail|Rails guide minecarts along paths you build through mines and bases. Powered rails need redstone to boost speed; detector rails send signals when carts pass. Craft plenty for long tunnels.
ladder|Ladder|Ladders let you climb vertical shafts quickly without jumping. Place them on walls in mines, towers, and mob farms. They are cheap to craft from sticks.
fence|Fence|Fences make pens for animals because most mobs cannot jump over them. Connect to fence gates for openings. They also make nice railings on balconies and bridges.
gate|Fence Gate|Fence gates open like doors but match fence height for animal pens. Right-click to walk through while keeping sheep and cows inside. They attach cleanly to fences and walls.
trapdoor|Trapdoor|Trapdoors are horizontal hatches in floors and ceilings, or vertical on walls. Use them for secret entrances, minecart stops, and compact ladders. Iron trapdoors need redstone to open.
beacon|Beacon|Beacons shoot a bright beam skyward when built on a pyramid of iron, gold, emerald, or diamond blocks. Choose buffs like Speed, Haste, or Jump Boost for nearby players. They are a late-game flex and utility.
bookshelf|Bookshelf|Bookshelves surround enchantment tables to unlock higher-level enchantments. They also decorate libraries and wizard towers. Craft them from planks and books—or break them with silk touch to keep the books.
portal|Nether Portal|Nether portals are purple frames built from obsidian and lit with flint and steel. Step inside to travel between the Overworld and the fiery Nether. Portals link by distance rules—build them carefully so they connect where you want.
enchanting|Enchanting|Enchanting rolls random powers onto tools, armor, and weapons using lapis and experience at an enchantment table. Bookshelves raise the level cap for better enchantments. Anvil plus enchanted books lets you pick exact enchants.
village|Village|Villages are clusters of houses, farms, and job sites where villagers live and trade. Iron golems defend them from raids if the village is big enough. Cure zombie villagers to repopulate empty towns.
temple|Jungle Pyramid|Jungle pyramids are stone temples hidden in jungles with levers, traps, and loot chests. Tripwire hooks can fire arrows if you are not careful. They often hold emeralds, bones, and horse armor.
fortress|Nether Fortress|Nether fortresses are huge dark castles in the Nether with blaze spawners and nether wart. Bridge carefully over lava halls. Wither skeletons here drop skulls needed to summon the Wither.
dungeon|Monster Room|Monster rooms are small brick rooms underground with a mob spawner in the center. Break or light up the spawner to stop endless mobs. Chests nearby often hold bread, saddles, or golden apples.
mineshaft|Mineshaft|Mineshafts are maze-like tunnels with rails, cobwebs, and loot chests underground. Cave spider spawners hide in some intersections. They cross-cut caves and can lead you to diamonds.
nether|The Nether|The Nether is a dangerous red dimension with lava lakes, fortresses, and unique mobs. Travel there through obsidian portals. Bring fire resistance, good armor, and coordinates so you can find your portal home.
overworld|Overworld|The Overworld is the main dimension with biomes, villages, caves, and the day-night cycle. Most survival adventures start and stay here. It connects to the Nether and the End through special portals.
biome|Biome|Biomes are regions with their own climate, blocks, plants, and mobs—deserts, jungles, taigas, and more. The F3 debug screen shows which biome you stand in. Exploring biomes helps you find villages, temples, and rare resources.
cave|Cave|Caves are hollow spaces underground full of ores, water pools, and mob spawns. Branch mine at low levels for diamonds, or explore huge lush and dripstone caves. Always carry torches and watch for lava above you.
jungle|Jungle|Jungles are dense, warm biomes with tall trees, vines, melons, and parrots. Jungle temples and bamboo forests appear here. Ocelots and pandas add life to the green canopy.
swamp|Swamp|Swamps have shallow murky water, lily pads, and witch huts on stilts. Slimes spawn here at night on certain moon phases. Clay and blue orchids are common finds.
ravine|Ravine|Ravines are deep cracks in the surface that expose stone, ores, and caves instantly. They save mining time but watch for long falls. Water or ladders help you descend safely.
stronghold|Stronghold|Strongholds are rare underground fortresses that hold End portal frames. Eyes of ender point toward the nearest one when thrown. Fill the portal frames to reach the End and fight the dragon.
craft|Crafting|Crafting combines materials in a 2×2 or 3×3 grid to make new items. Your inventory crafting square handles simple recipes; a crafting table opens the full grid. Recipes are the heart of turning raw blocks into tools.
mine|Mining|Mining means digging underground for stone, coal, iron, and rare gems. Strip mine at Y=-59 for diamonds in modern versions, or explore natural caves with torches. Always watch lava and bring food.
build|Building|Building is placing blocks to make houses, farms, castles, and anything you imagine. Creative mode gives unlimited blocks; survival makes you gather each one. Good lighting and walls keep mobs out of your base.
spawn|Spawn|Spawn is the place where players first appear and where mobs generate in the world. Your world spawn can be moved with a bed or respawn anchor. Mob spawners continuously create enemies until broken or lit up.
world|World|A world is your saved Minecraft map with its own seed, builds, and adventures. You can play the same world solo or on a server with friends. Back up important worlds so you never lose your base.
seed|Seed|A seed is a text or number code that generates a specific world layout of biomes and structures. Share seeds with friends to explore the same mountains and villages. Different editions may shape terrain slightly differently.
player|Player|You are the player: the character who mines, builds, fights, and explores. In survival you manage health, hunger, and inventory. Multiplayer lets many players share one world and team up.
mob|Mob|Mobs are living entities in the world—animals, monsters, villagers, and bosses. Passive mobs flee or ignore you; hostile ones attack in the dark or when provoked. Some mobs can be bred, tamed, or traded with.
item|Item|Items are things you pick up and carry: tools, food, blocks, and drops. Stack most items up to 64 per slot. Drop items on the ground or store them in chests and shulker boxes.
inventory|Inventory|Your inventory holds everything you carry, with armor slots on the left and a 2×2 craft area. Open it with E on keyboard. Full inventory means you must make room before mining more loot.
hotbar|Hotbar|The hotbar is the nine quick slots at the bottom of the screen for fast tool swaps. Number keys 1–9 select slots on computer. Scroll the mouse wheel to cycle items in Java Edition.
enchant|Enchanting|To enchant is to add magical bonuses like Sharpness or Unbreaking using an enchantment table or anvil. You spend experience levels and lapis lazuli. Combine books on an anvil to build perfect gear.
enchantment|Enchantment|Enchantments are special bonuses on gear: Fortune for extra ore, Silk Touch for intact blocks, Mending for repair with XP. Higher levels cost more experience. Some enchants conflict and cannot share one item.
survival|Survival|Survival mode means gathering resources, managing hunger, and staying alive against mobs. Death drops your items unless keepInventory is on. It is the classic Minecraft challenge most players learn first.
creative|Creative|Creative mode gives unlimited blocks and items, flight, and instant breaking. Mobs ignore you and you cannot die from damage. Builders and redstone engineers love it for testing big projects.
farming|Farming|Farming grows wheat, carrots, potatoes, and melons on hydrated farmland. Breed cows, pigs, and chickens for steady food and drops. Bone meal speeds crop growth; fences keep animals safe.
mining|Mining|Mining in the skill sense means tunneling for ores and stone to progress your gear. Iron unlocks buckets and anvils; diamond unlocks the Nether and enchantments. Branch mines and cave exploration are both valid strategies.
trading|Trading|Trading swaps emeralds with villagers for enchanted books, gear, and food. Each villager job offers different deals that refresh daily. Zombie villagers cured with golden apples give discount prices.
brewing|Brewing|Brewing mixes nether wart, bottles, and ingredients in a brewing stand to make potions. Blaze powder powers the stand. Potions grant strength, fire resistance, healing, and more for tough fights.
smelting|Smelting|Smelting cooks raw food and melts ore into ingots in a furnace using fuel like coal. One fuel smelts several items depending on type. Super smelt enchantments on tools drop ingots directly sometimes.
crafting|Crafting|Crafting turns raw logs, ore, and drops into tools, blocks, and machines using recipe grids. Discover recipes by picking up new materials. The recipe book remembers what you can make.
respawn|Respawn|Respawn is coming back after you lose all your health, usually at your bed or world spawn. Set a bed in a safe room so you do not return far away. Hardcore mode deletes the world instead of respawning.
harvest|Harvesting|Harvesting means breaking fully grown crops or ripe blocks to collect food and seeds. Replant so your farm keeps producing. Fortune on hoes does not help crops—wait for the right growth stage.
explore|Exploration|Exploration is traveling into new chunks to find villages, temples, biomes, and loot. Bring maps, food, a bed, and coordinates. Boats, horses, and elytra make long trips faster.
tame|Taming|Taming turns wild wolves into dogs with bones, cats with raw fish, and horses with repeated riding attempts. Tamed mobs follow and help you. Llamas accept leads; parrots dance to music discs.
breed|Breeding|Breeding feeds two adult animals the right food—wheat for cows, seeds for chickens—to spawn a baby. Babies grow up over time for more food and drops. You need at least two of the same species.
smelt|Smelting|To smelt is to use a furnace to cook meat or melt ore with fuel. Raw iron becomes iron ingots; raw chicken becomes safe cooked chicken. Furnace minecarts smelt while rolling on rails.
loot|Loot|Loot is treasure from chests in dungeons, temples, and bastions, or drops from defeated mobs. Good loot speeds up your progress with enchanted gear and rare items. Always check chests when exploring structures.
stack|Stack|A stack is up to 64 of the same item in one inventory slot—except tools, armor, and a few specials that stack to 16 or 1. Shift-click moves whole stacks quickly. Full stacks save space when storing cobblestone and food.
health|Health|Health is your red heart bar showing how much damage you can take before dying. Food and potions do not heal directly unless you play with regeneration from saturation. Golden apples and potions help in fights.
hunger|Hunger|Hunger is the meat drumstick bar that drains when you sprint, jump, and fight. Eat food to refill it; saturation hidden behind it controls healing. Some foods like steak fill you up longer than cookies.
experience|Experience|Experience is green orbs and levels used for enchanting, anvils, and mending repair. Mine, smelt, breed, and fight to earn XP. Higher enchantments cost more levels but make gear much stronger.
adventure|Adventure|Adventure mode limits breaking blocks unless you use special tools with CanDestroy tags—common on custom maps. You can still interact with levers, chests, and villagers. Map makers use it for story worlds and parkour.
stew|Stew|Stew comes in mushroom, rabbit, beetroot, and suspicious varieties with different effects. Suspicious stew from flowers can give saturation or even poison—know your recipe. Bowls return to you after eating stew.
honey|Honey Bottle|Honey bottles restore hunger and cure poison when you drink them. Collect honey from bee nests with campfires below to calm bees. Honey blocks slow falls and stick to other blocks in redstone builds.
steak|Steak|Steak is cooked beef from cows and fills hunger better than many early foods. Breed cows in pens for a renewable steak supply. It is a staple before you discover golden carrots or stew.
melon|Melon|Melon blocks grow from melon stems on farmland and drop melon slices when broken. Seeds come from chests or breaking melons. Pigs follow melon slices, and glistering melons brew potions.
berry|Sweet Berries|Sweet berries grow on bushes in taigas and hurt you slightly when you walk through them. Harvest berries for food and fox breeding. They are a quick snack while exploring cold forests.
mushroom|Mushroom|Red and brown mushrooms appear in dark forests, swamps, and the Nether. Craft mushroom stew with a bowl, or grow huge mushrooms with bonemeal on mycelium. Mooshrooms carry unlimited stew when milked with a bowl.
sapling|Sapling|Saplings drop from leaves when trees break and grow into full trees when planted on dirt or grass. Bone meal speeds growth for quick wood farms. Different saplings become oak, birch, spruce, or jungle trees.
kelp|Kelp|Kelp grows upward underwater and can be smelted into dried kelp for food and fuel. Build underwater farms with soul sand bubble columns. Dried kelp blocks burn well in furnaces.
coral|Coral|Coral blocks come in many colors but die outside water, turning gray unless placed wet. Find live coral in warm oceans near reefs. Use them for colorful underwater builds with water logged blocks.
potion|Potion|Potions brew in a stand from water bottles, nether wart, and ingredients like blaze powder or spider eyes. Drink them for strength, invisibility, night vision, and more. Splash potions affect nearby mobs and players.
repeater|Redstone Repeater|Redstone repeaters delay signals and boost them so power travels farther down a line. Rotate them to change delay ticks for precise timing. They only pass signal one direction, unlike dust loops.
comparator|Redstone Comparator|Redstone comparators compare signal strength from chests and containers for item sorters. They also subtract signals and read lectern book pages. Essential for advanced farms and storage systems.
observer|Observer|Observers watch the block in front and send a quick pulse when it changes—crops growing, doors opening, sand falling. Face them into pistons for automatic harvesters. They detect updates instantly in front, not behind.
pearl|Ender Pearl|Ender pearls teleport you to where they land when thrown, at the cost of a little damage. Endermen drop them; combine with blaze powder for eyes of ender. Do not throw them into the void or lava.
crystal|End Crystal|End crystals sit on obsidian pillars in the End and heal the Ender Dragon until broken. Craft them for respawn rituals with ghast tears and glass. Their explosion is huge—stand back if one breaks.
shulker|Shulker|Shulkers hide in End city boxes and shoot levitation bullets that make you float upward. Their shulker shells craft into shulker boxes—portable chests that keep items when broken. Purple shulkers blend into purpur cities.
chorus|Chorus Fruit|Chorus fruit grows on chorus plants in the End outer islands. Eating it may randomly teleport you a short distance—handy for escaping or climbing. Popped chorus fruit crafts purpur blocks for building.
"""


_BY_WORD: dict[str, tuple[str, str]] = {}
for raw_line in _LINES.strip().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    parts = [part.strip() for part in line.split("|")]
    if len(parts) < 3:
        continue
    word, page, blurb = parts[0], parts[1], parts[2]
    _BY_WORD[word] = (page, blurb)

_IMAGES_PATH = Path(__file__).resolve().parent / "mc_wiki_images.json"
_REMOTE_IMAGES_PATH = Path(__file__).resolve().parent / "mc_wiki_images_remote.json"
_KIDS_PATH = Path(__file__).resolve().parent / "mc_kids_blurbs.json"
_STATS_PATH = Path(__file__).resolve().parent / "mc_word_stats.json"
try:
    _IMAGE_URLS: dict[str, str] = json.loads(
        _IMAGES_PATH.read_text(encoding="utf-8")
    )
except (FileNotFoundError, json.JSONDecodeError, OSError):
    _IMAGE_URLS = {}
try:
    _REMOTE_IMAGE_URLS: dict[str, str] = json.loads(
        _REMOTE_IMAGES_PATH.read_text(encoding="utf-8")
    )
except (FileNotFoundError, json.JSONDecodeError, OSError):
    _REMOTE_IMAGE_URLS = {}
if not _REMOTE_IMAGE_URLS:
    _REMOTE_IMAGE_URLS = {
        k: v for k, v in _IMAGE_URLS.items() if str(v).strip().startswith("http")
    }
try:
    _KIDS_BLURBS: dict[str, str] = json.loads(_KIDS_PATH.read_text(encoding="utf-8"))
except (FileNotFoundError, json.JSONDecodeError, OSError):
    _KIDS_BLURBS = {}
try:
    _WORD_STATS: dict[str, dict] = json.loads(_STATS_PATH.read_text(encoding="utf-8"))
except (FileNotFoundError, json.JSONDecodeError, OSError):
    _WORD_STATS = {}

_MC_STAT_CATEGORIES = frozenset(
    {"block", "resource", "tool", "armor", "friendly", "monster", "boss", "place", "tip"}
)
_MC_STAT_RARITIES = frozenset(
    {"common", "uncommon", "rare", "very_rare", "unique"}
)
_MC_STAT_VALUES = frozenset({"handy", "useful", "valuable", "treasure"})
_MC_STAT_DANGERS = frozenset(
    {"safe", "careful", "dangerous", "very_dangerous", "boss"}
)


def _normalize_mc_stats(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    cat = str(raw.get("category", "")).strip()
    rar = str(raw.get("rarity", "")).strip()
    if cat not in _MC_STAT_CATEGORIES or rar not in _MC_STAT_RARITIES:
        return None
    out: dict[str, str] = {"category": cat, "rarity": rar}
    val = str(raw.get("value", "")).strip()
    if val in _MC_STAT_VALUES:
        out["value"] = val
    dng = str(raw.get("danger", "")).strip()
    if dng in _MC_STAT_DANGERS:
        out["danger"] = dng
    return out


def local_wiki_image_path(word: str, remote_url: str) -> str:
    """Map a wiki thumbnail URL to a repo-relative cached file path."""
    path = urllib.parse.urlparse(remote_url).path.lower()
    if path.endswith(".gif"):
        ext = ".gif"
    elif path.endswith(".webp"):
        ext = ".webp"
    else:
        ext = ".png"
    return f"assets/wiki/{word.strip().lower()}{ext}"


def mc_wiki_fields(word: str) -> dict:
    """Return Minecraft Wiki fields for a lowercase word."""
    key = (word or "").strip().lower()
    if key in _BY_WORD:
        page, blurb = _BY_WORD[key]
        out = {"mcWikiPage": page, "mcBlurb": blurb}
        kids = str(_KIDS_BLURBS.get(key, "")).strip()
        if kids:
            out["mcKidsBlurb"] = kids
        stats = _normalize_mc_stats(_WORD_STATS.get(key))
        if stats:
            out["mcStats"] = stats
        remote = str(_REMOTE_IMAGE_URLS.get(key, "")).strip()
        if remote:
            out["mcImageUrl"] = local_wiki_image_path(key, remote)
        return out

    fallback_title = key.replace("_", " ").title() if key else "Minecraft"
    fallback_blurb = (
        "This Minecraft topic appears in the official wiki with tips, crafting, "
        "and world facts. Read more on the link below to learn how it works in the game."
    )
    fallback_kids = (
        "This is something cool in Minecraft. Tap the wiki link to learn more about it."
    )
    return {
        "mcWikiPage": fallback_title,
        "mcBlurb": fallback_blurb,
        "mcKidsBlurb": fallback_kids,
        "mcStats": {"category": "tip", "rarity": "common"},
    }


def minecraft_wiki_url(page: str) -> str:
    """Build a Minecraft Wiki URL from a page title."""
    return "https://minecraft.wiki/w/" + page.replace(" ", "_")
