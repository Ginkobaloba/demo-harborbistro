import type { Course, CustomizationGroup } from "@/lib/types";

/**
 * Harbor Bistro seed menu: 60 items across 7 courses. Photo URLs are
 * curated Unsplash stock for v0 (docs/decisions.md D-001); the chunk 3.11
 * photography pass re-validates every URL and swaps in AI-generated food
 * photos. scripts/verify-seed.ts enforces counts, price ranges, and the
 * 30-photo floor.
 */

export type SeedMenuItem = {
  slug: string;
  name: string;
  course: Course;
  description: string;
  priceCents: number;
  photoUrl?: string;
  isVegetarian?: boolean;
  isVegan?: boolean;
  isGlutenFree?: boolean;
  containsNuts?: boolean;
  customizationOptions?: CustomizationGroup[];
  isFeatured?: boolean;
};

const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;

// Reusable customization groups.

const STEAK_TEMP: CustomizationGroup = {
  id: "temp",
  label: "Temperature",
  type: "single",
  required: true,
  choices: [
    { id: "rare", label: "Rare" },
    { id: "medium-rare", label: "Medium Rare" },
    { id: "medium", label: "Medium" },
    { id: "medium-well", label: "Medium Well" },
    { id: "well", label: "Well Done" },
  ],
};

const ENTREE_SIDE: CustomizationGroup = {
  id: "side",
  label: "Choice of side",
  type: "single",
  required: true,
  choices: [
    { id: "frites", label: "Sea-Salt Frites" },
    { id: "smashed-potatoes", label: "Smashed Potatoes" },
    { id: "wild-rice", label: "Wild Rice Pilaf" },
    { id: "greens", label: "Garlicky Greens" },
  ],
};

const DRESSING: CustomizationGroup = {
  id: "dressing",
  label: "Dressing",
  type: "single",
  required: true,
  choices: [
    { id: "house", label: "Cider Vinaigrette" },
    { id: "buttermilk", label: "Buttermilk Ranch" },
    { id: "lemon-tahini", label: "Lemon Tahini" },
    { id: "side", label: "Dressing on the side" },
  ],
};

const ADD_PROTEIN: CustomizationGroup = {
  id: "protein",
  label: "Add a protein",
  type: "single",
  choices: [
    { id: "none", label: "No thanks" },
    { id: "chicken", label: "Grilled Chicken", priceCents: 700 },
    { id: "shrimp", label: "Grilled Shrimp", priceCents: 900 },
    { id: "whitefish", label: "Smoked Whitefish", priceCents: 800 },
  ],
};

const BURGER_EXTRAS: CustomizationGroup = {
  id: "extras",
  label: "Add-ons",
  type: "multi",
  choices: [
    { id: "bacon", label: "Smoked Bacon", priceCents: 300 },
    { id: "egg", label: "Fried Egg", priceCents: 200 },
    { id: "avocado", label: "Avocado", priceCents: 250 },
    { id: "extra-patty", label: "Extra Patty", priceCents: 500 },
  ],
};

export const SEED_MENU: SeedMenuItem[] = [
  // ---------------------------------------------------------------- snacks
  {
    slug: "heirloom-tomato-tartine",
    name: "Heirloom Tomato Tartine",
    course: "snacks",
    description:
      "Grilled sourdough piled with heirloom tomatoes, whipped ricotta, basil oil, and flaky salt. Summer on toast.",
    priceCents: 1200,
    photoUrl: unsplash("photo-1541519227354-08fa5d50c44d"),
    isVegetarian: true,
    isFeatured: true,
  },
  {
    slug: "charred-octopus-fingerling",
    name: "Charred Octopus with Fingerling Potato",
    course: "snacks",
    description:
      "Spanish octopus charred over hardwood with crispy fingerlings, smoked paprika aioli, and celery leaf.",
    priceCents: 1700,
    photoUrl: unsplash("photo-1599487488170-d11ec9c172f0"),
    isGlutenFree: true,
  },
  {
    slug: "smoked-whitefish-dip",
    name: "Smoked Whitefish Dip",
    course: "snacks",
    description:
      "Great Lakes whitefish smoked in-house, folded with creme fraiche and dill. House crackers, pickled red onion.",
    priceCents: 1300,
    photoUrl: unsplash("photo-1541529086526-db283c563270"),
  },
  {
    slug: "crispy-walleye-bites",
    name: "Crispy Walleye Bites",
    course: "snacks",
    description:
      "Cornmeal-crusted walleye, fried to order. Tartar sauce, charred lemon, shaved fennel.",
    priceCents: 1400,
    photoUrl: unsplash("photo-1579208030886-b937da0925dc"),
  },
  {
    slug: "wood-fired-shishitos",
    name: "Wood-Fired Shishitos",
    course: "snacks",
    description:
      "Blistered shishito peppers, flaky salt, charred lemon. About one in ten bites back.",
    priceCents: 900,
    photoUrl: unsplash("photo-1625944525533-473f1a3d54e7"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "duck-fat-frites",
    name: "Duck Fat Frites",
    course: "snacks",
    description:
      "Twice-cooked frites finished in duck fat, rosemary salt, malt vinegar aioli.",
    priceCents: 900,
    photoUrl: unsplash("photo-1573080496219-bb080dd4f877"),
  },
  {
    slug: "oysters-half-shell",
    name: "Oysters on the Half Shell",
    course: "snacks",
    description:
      "Half dozen East Coast oysters on ice with champagne mignonette and lemon.",
    priceCents: 1800,
    photoUrl: unsplash("photo-1572715376701-98568319fd0b"),
    isGlutenFree: true,
  },
  {
    slug: "bistro-bread-butter",
    name: "Bistro Bread & Cultured Butter",
    course: "snacks",
    description:
      "Warm sourdough boule from our oven with sea-salted cultured butter.",
    priceCents: 600,
    photoUrl: unsplash("photo-1509440159596-0249088772ff"),
    isVegetarian: true,
  },
  {
    slug: "beer-battered-cheese-curds",
    name: "Beer-Battered Cheese Curds",
    course: "snacks",
    description:
      "Local cheddar curds in a lager batter with ramp ranch. Non-negotiable in this state.",
    priceCents: 1100,
    photoUrl: unsplash("photo-1531749668029-2db88e4276c7"),
    isVegetarian: true,
  },
  {
    slug: "chilled-shrimp-cocktail",
    name: "Chilled Shrimp Cocktail",
    course: "snacks",
    description:
      "Poached jumbo shrimp, horseradish cocktail sauce, lemon. Cold, classic, correct.",
    priceCents: 1600,
    isGlutenFree: true,
  },

  // ---------------------------------------------------------------- salads
  {
    slug: "little-gem-caesar",
    name: "Little Gem Caesar",
    course: "salads",
    description:
      "Little gem lettuce, white anchovy, sourdough crumb, grana padano. The dressing pulls no punches.",
    priceCents: 1300,
    photoUrl: unsplash("photo-1550304943-4f24f54ddde9"),
    customizationOptions: [ADD_PROTEIN],
  },
  {
    slug: "harbor-greens",
    name: "Harbor Greens",
    course: "salads",
    description:
      "Soft lettuces, shaved radish, fennel, herbs, cider vinaigrette. The reset button.",
    priceCents: 1100,
    photoUrl: unsplash("photo-1512621776951-a57141f2eefd"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
    customizationOptions: [DRESSING, ADD_PROTEIN],
  },
  {
    slug: "roasted-beet-chevre",
    name: "Roasted Beet & Chevre",
    course: "salads",
    description:
      "Slow-roasted beets, whipped goat cheese, candied walnuts, arugula, sherry vinaigrette.",
    priceCents: 1400,
    photoUrl: unsplash("photo-1505576399279-565b52d4ac71"),
    isVegetarian: true,
    isGlutenFree: true,
    containsNuts: true,
  },
  {
    slug: "grilled-peach-burrata",
    name: "Grilled Peach & Burrata",
    course: "salads",
    description:
      "Grill-kissed peaches, torn burrata, prosciutto, hot honey, basil. While summer lasts.",
    priceCents: 1600,
    photoUrl: unsplash("photo-1573821663912-6df460f9c684"),
    isGlutenFree: true,
  },
  {
    slug: "charred-broccoli-salad",
    name: "Charred Broccoli Salad",
    course: "salads",
    description:
      "Charred broccoli, smoked almonds, golden raisins, lemon tahini. Eat your vegetables, gladly.",
    priceCents: 1200,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
    containsNuts: true,
    customizationOptions: [ADD_PROTEIN],
  },
  {
    slug: "wedge-smoked-bacon",
    name: "Wedge with Smoked Bacon",
    course: "salads",
    description:
      "Iceberg wedge, buttermilk blue cheese, house-smoked bacon, chive, cherry tomato.",
    priceCents: 1300,
    photoUrl: unsplash("photo-1551248429-40975aa4de74"),
    isGlutenFree: true,
  },
  {
    slug: "watermelon-feta",
    name: "Watermelon & Feta",
    course: "salads",
    description:
      "Compressed watermelon, feta, mint, pickled jalapeno, lime. Sweet, salty, a little loud.",
    priceCents: 1200,
    photoUrl: unsplash("photo-1564093497595-593b96d80180"),
    isVegetarian: true,
    isGlutenFree: true,
  },

  // --------------------------------------------------------------- entrees
  {
    slug: "lake-whitefish-brown-butter",
    name: "Lake Whitefish in Brown Butter",
    course: "entrees",
    description:
      "Pan-seared Lake Superior whitefish, brown butter, capers, lemon, crispy fingerlings. The house signature.",
    priceCents: 2800,
    photoUrl: unsplash("photo-1580476262798-bddd9f4b7369"),
    isGlutenFree: true,
    isFeatured: true,
    customizationOptions: [ENTREE_SIDE],
  },
  {
    slug: "pan-roasted-walleye",
    name: "Pan-Roasted Walleye",
    course: "entrees",
    description:
      "Walleye with sweet corn succotash, blistered cherry tomatoes, and basil.",
    priceCents: 2900,
    photoUrl: unsplash("photo-1535399831218-d5bd36d1a6b3"),
    isGlutenFree: true,
  },
  {
    slug: "grilled-hanger-steak",
    name: "Grilled Hanger Steak",
    course: "entrees",
    description:
      "Hardwood-grilled hanger steak, charred onion, bordelaise, sea-salt frites.",
    priceCents: 3400,
    photoUrl: unsplash("photo-1600891964092-4316c288032e"),
    isFeatured: true,
    customizationOptions: [STEAK_TEMP, ENTREE_SIDE],
  },
  {
    slug: "wood-grilled-ny-strip",
    name: "Wood-Grilled NY Strip",
    course: "entrees",
    description:
      "14 oz New York strip over hardwood coals, maitre d' butter, watercress.",
    priceCents: 3600,
    photoUrl: unsplash("photo-1546964124-0cce460f38ef"),
    isGlutenFree: true,
    customizationOptions: [STEAK_TEMP, ENTREE_SIDE],
  },
  {
    slug: "cedar-plank-salmon",
    name: "Cedar-Plank Salmon",
    course: "entrees",
    description:
      "Salmon roasted on cedar with a maple glaze, wild rice pilaf, charred scallion.",
    priceCents: 3000,
    photoUrl: unsplash("photo-1485921325833-c519f76c4927"),
    isGlutenFree: true,
  },
  {
    slug: "roast-half-chicken",
    name: "Roast Half Chicken",
    course: "entrees",
    description:
      "Brined and roasted half chicken, pan jus, smashed potatoes, garlicky greens.",
    priceCents: 2600,
    photoUrl: unsplash("photo-1598103442097-8b74394b95c6"),
    isGlutenFree: true,
  },
  {
    slug: "harbor-smash-burger",
    name: "Harbor Smash Burger",
    course: "entrees",
    description:
      "Two smashed patties, aged cheddar, shaved onion, pickles, harbor sauce, sea-salt frites.",
    priceCents: 1700,
    photoUrl: unsplash("photo-1568901346375-23c9450c58cd"),
    customizationOptions: [BURGER_EXTRAS],
  },
  {
    slug: "fried-chicken-sandwich",
    name: "Fried Chicken Sandwich",
    course: "entrees",
    description:
      "Buttermilk fried chicken, pickle slaw, hot honey, toasted potato bun, frites.",
    priceCents: 1600,
    photoUrl: unsplash("photo-1606755962773-d324e0a13086"),
  },
  {
    slug: "mushroom-cavatelli",
    name: "Mushroom Cavatelli",
    course: "entrees",
    description:
      "House cavatelli, roasted maitake and cremini, parmesan brodo, soft herbs.",
    priceCents: 2200,
    photoUrl: unsplash("photo-1473093295043-cdd812d0e601"),
    isVegetarian: true,
  },
  {
    slug: "squash-risotto",
    name: "Squash Risotto",
    course: "entrees",
    description:
      "Carnaroli risotto with roasted squash, brown butter, crispy sage, toasted pepitas.",
    priceCents: 2100,
    photoUrl: unsplash("photo-1476124369491-e7addf5db371"),
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "drunken-mussels-frites",
    name: "Drunken Mussels & Frites",
    course: "entrees",
    description:
      "A kilo of mussels steamed in white wine, garlic, and butter. Frites and grilled bread for the broth.",
    priceCents: 2400,
    photoUrl: unsplash("photo-1572695157366-5e585ab2b69f"),
  },
  {
    slug: "charred-cauliflower-steak",
    name: "Charred Cauliflower Steak",
    course: "entrees",
    description:
      "Thick-cut cauliflower charred hard, almond romesco, castelvetrano olives, herbs.",
    priceCents: 1900,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
    containsNuts: true,
  },

  // ----------------------------------------------------------------- sides
  {
    slug: "sea-salt-frites",
    name: "Sea-Salt Frites",
    course: "sides",
    description: "Twice-cooked, aggressively crisp, lightly salted.",
    priceCents: 700,
    photoUrl: unsplash("photo-1518013431117-eb1465fa5752"),
    isVegan: true,
    isVegetarian: true,
  },
  {
    slug: "smashed-potatoes",
    name: "Smashed Potatoes",
    course: "sides",
    description: "Crispy smashed yukons, creme fraiche, chive.",
    priceCents: 800,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "wild-rice-pilaf",
    name: "Wild Rice Pilaf",
    course: "sides",
    description: "Minnesota wild rice, toasted shallot, herbs.",
    priceCents: 700,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "grilled-asparagus",
    name: "Grilled Asparagus",
    course: "sides",
    description: "Charred asparagus, lemon, olive oil, flaky salt.",
    priceCents: 900,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "mac-and-cheese",
    name: "Mac & Cheese",
    course: "sides",
    description:
      "Three-cheese sauce, cavatappi, toasted sourdough crumb. Unreasonably rich.",
    priceCents: 900,
    photoUrl: unsplash("photo-1543339494-b4cd4f7ba686"),
    isVegetarian: true,
  },
  {
    slug: "charred-sweet-corn",
    name: "Charred Sweet Corn",
    course: "sides",
    description: "Elote-style: lime crema, cotija, chile, cilantro.",
    priceCents: 800,
    photoUrl: unsplash("photo-1551754655-cd27e38d2076"),
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "garlicky-greens",
    name: "Garlicky Greens",
    course: "sides",
    description: "Seasonal greens wilted with garlic confit and chile flake.",
    priceCents: 700,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "buttermilk-biscuits",
    name: "Buttermilk Biscuits",
    course: "sides",
    description: "Two tall biscuits with whipped honey butter.",
    priceCents: 600,
    photoUrl: unsplash("photo-1590301157890-4810ed352733"),
    isVegetarian: true,
  },

  // -------------------------------------------------------------- desserts
  {
    slug: "door-county-cherry-pie",
    name: "Door County Cherry Pie",
    course: "desserts",
    description:
      "Tart cherry pie with a lattice crust and vanilla bean ice cream. Regional pride, plated.",
    priceCents: 1100,
    photoUrl: unsplash("photo-1464305795204-6f5bbfc7fb81"),
    isVegetarian: true,
    isFeatured: true,
  },
  {
    slug: "dark-chocolate-torte",
    name: "Dark Chocolate Torte",
    course: "desserts",
    description:
      "Flourless chocolate torte, hazelnut praline, whipped cream, cocoa nib.",
    priceCents: 1200,
    photoUrl: unsplash("photo-1578985545062-69928b1d9587"),
    isVegetarian: true,
    isGlutenFree: true,
    containsNuts: true,
  },
  {
    slug: "lemon-posset",
    name: "Lemon Posset",
    course: "desserts",
    description: "Silky lemon cream, macerated berries, shortbread.",
    priceCents: 900,
    isVegetarian: true,
  },
  {
    slug: "butterscotch-budino",
    name: "Butterscotch Budino",
    course: "desserts",
    description:
      "Butterscotch pudding, salted caramel, pretzel crumble, soft cream.",
    priceCents: 1000,
    photoUrl: unsplash("photo-1488477181946-6428a0291777"),
    isVegetarian: true,
  },
  {
    slug: "seasonal-sorbet",
    name: "Seasonal Sorbet",
    course: "desserts",
    description: "Two scoops of whatever fruit is best this week.",
    priceCents: 800,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "vanilla-creme-brulee",
    name: "Vanilla Bean Creme Brulee",
    course: "desserts",
    description: "Classic custard, torched sugar shell, no improvements needed.",
    priceCents: 1000,
    photoUrl: unsplash("photo-1470124182917-cc6e71b22ecc"),
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "warm-donut-holes",
    name: "Warm Donut Holes",
    course: "desserts",
    description:
      "Cinnamon-sugar donut holes, dark chocolate and bourbon caramel for dunking.",
    priceCents: 900,
    photoUrl: unsplash("photo-1551024601-bec78aea704b"),
    isVegetarian: true,
  },

  // ---------------------------------------------------------------- drinks
  {
    slug: "sparkling-water",
    name: "Sparkling Water",
    course: "drinks",
    description: "750ml bottle, still available on request.",
    priceCents: 500,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "house-lemonade",
    name: "House Lemonade",
    course: "drinks",
    description: "Fresh-squeezed, lightly sweet, plenty of ice.",
    priceCents: 500,
    photoUrl: unsplash("photo-1523677011781-c91d1bbe2f9e"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "basil-cucumber-soda",
    name: "Basil-Cucumber Soda",
    course: "drinks",
    description: "House soda: muddled basil, cucumber, lime, soda water.",
    priceCents: 600,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "cold-brew-coffee",
    name: "Cold-Brew Coffee",
    course: "drinks",
    description: "Locally roasted, steeped 18 hours, served over ice.",
    priceCents: 500,
    photoUrl: unsplash("photo-1517701550927-30cf4ba1dba5"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "drip-coffee",
    name: "Drip Coffee",
    course: "drinks",
    description: "Bottomless cup from our neighborhood roaster.",
    priceCents: 400,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "ginger-beer",
    name: "Ginger Beer",
    course: "drinks",
    description: "Spicy, non-alcoholic, brewed nearby.",
    priceCents: 500,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "iced-tea",
    name: "Iced Tea",
    course: "drinks",
    description: "Black tea, unsweetened, lemon on the side.",
    priceCents: 400,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "arnold-palmer",
    name: "Arnold Palmer",
    course: "drinks",
    description: "Half house lemonade, half iced tea.",
    priceCents: 500,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },

  // ------------------------------------------------------------- cocktails
  {
    slug: "harbor-old-fashioned",
    name: "Harbor Old Fashioned",
    course: "cocktails",
    description:
      "Brandy, the way the upper Midwest insists. Demerara, bitters, orange, brandied cherry.",
    priceCents: 1300,
    photoUrl: unsplash("photo-1470337458703-46ad1756a187"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "lighthouse-gimlet",
    name: "Lighthouse Gimlet",
    course: "cocktails",
    description: "Gin, fresh lime cordial, a whisper of dill.",
    priceCents: 1200,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "pier-spritz",
    name: "Pier Spritz",
    course: "cocktails",
    description: "Aperol, prosecco, soda, orange. Sunset in a glass.",
    priceCents: 1100,
    photoUrl: unsplash("photo-1560512823-829485b8bf24"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "smoked-salt-margarita",
    name: "Smoked Salt Margarita",
    course: "cocktails",
    description: "Blanco tequila, lime, orange liqueur, smoked salt rim.",
    priceCents: 1200,
    photoUrl: unsplash("photo-1556855810-ac404aa91e85"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "night-watch",
    name: "Night Watch",
    course: "cocktails",
    description: "Espresso martini: vodka, cold-brew, coffee liqueur, demerara.",
    priceCents: 1300,
    photoUrl: unsplash("photo-1545438102-799c3991ffb2"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "juniper-and-tonic",
    name: "Juniper & Tonic",
    course: "cocktails",
    description: "Local dry gin, artisan tonic, lime, juniper berries.",
    priceCents: 1100,
    photoUrl: unsplash("photo-1514362545857-3bc16c4c7d1b"),
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "boathouse-smash",
    name: "Boathouse Smash",
    course: "cocktails",
    description: "Bourbon, lemon, mint, a little maple. Porch-ready.",
    priceCents: 1200,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    slug: "zero-proof-paloma",
    name: "Zero-Proof Paloma",
    course: "cocktails",
    description:
      "Grapefruit, lime, agave, soda, salted rim. All of the ritual, none of the proof.",
    priceCents: 900,
    isVegan: true,
    isVegetarian: true,
    isGlutenFree: true,
  },
];
