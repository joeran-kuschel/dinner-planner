/**
 * The starting dictionary of ingredient names in English and German (#74): one group per ingredient, with the
 * names it goes by in each language. Safe for client code.
 *
 * - The FIRST name of a language is the one a grocery line shows when the page is in that language.
 * - A name belongs to exactly one group (`tests/unit/lib/ingredients/names.test.ts` checks), so "Kümmel" (caraway)
 *   and "Kreuzkümmel" (cumin), or milk and coconut milk, are separate groups and are never merged on their own.
 * - A word that can mean two things ("Paprika": the vegetable or the powder) is left out on purpose.
 * - `impliesGroup`/`impliesUnit`: the name already contains the unit ("Knoblauchzehe" is garlic, one clove).
 */

export type NameGroup = {
  id: string;
  en: readonly string[];
  de: readonly string[];
  /** A group whose names stand for another group in a unit of its own, e.g. "garlic clove" is garlic in cloves. */
  impliesGroup?: string;
  impliesUnit?: string;
};

export const NAME_GROUPS: readonly NameGroup[] = [
  // clove forms below also set the unit to clove
  { id: "garlic", en: ["garlic"], de: ["Knoblauch"] },
  // = garlic with unit clove/Zehe
  { id: "garlic-clove", en: ["garlic clove", "garlic cloves", "clove of garlic"], de: ["Knoblauchzehe", "Knoblauchzehen"], impliesGroup: "garlic", impliesUnit: "clove" },
  { id: "salt", en: ["salt"], de: ["Salz"] },
  { id: "pepper", en: ["pepper", "black pepper"], de: ["Pfeffer", "schwarzer Pfeffer"] },
  // whole, not ground pepper
  { id: "peppercorns", en: ["black peppercorns", "peppercorns"], de: ["schwarze Pfefferkörner", "Pfefferkörner"] },
  { id: "olive-oil", en: ["olive oil", "extra virgin olive oil"], de: ["Olivenöl", "natives Olivenöl extra"] },
  { id: "vegetable-oil", en: ["vegetable oil", "neutral oil"], de: ["neutrales Öl", "Pflanzenöl"] },
  { id: "butter", en: ["butter"], de: ["Butter"] },
  { id: "sugar", en: ["sugar"], de: ["Zucker"] },
  // plain (UK) and all-purpose (US) treated as one
  { id: "flour", en: ["flour", "plain flour", "all-purpose flour"], de: ["Mehl", "Weizenmehl"] },
  { id: "baking-powder", en: ["baking powder"], de: ["Backpulver"] },
  { id: "onion", en: ["onion", "onions"], de: ["Zwiebel", "Zwiebeln"] },
  { id: "red-onion", en: ["red onion", "red onions"], de: ["rote Zwiebel", "rote Zwiebeln"] },
  { id: "shallot", en: ["shallot", "shallots"], de: ["Schalotte", "Schalotten"] },
  { id: "lemon", en: ["lemon", "lemons"], de: ["Zitrone", "Zitronen"] },
  { id: "lemon-juice", en: ["lemon juice"], de: ["Zitronensaft"] },
  { id: "carrot", en: ["carrot", "carrots"], de: ["Möhre", "Möhren", "Karotte", "Karotten"] },
  { id: "potato", en: ["potato", "potatoes"], de: ["Kartoffel", "Kartoffeln"] },
  { id: "parsnip", en: ["parsnip", "parsnips"], de: ["Pastinake", "Pastinaken"] },
  { id: "tomato", en: ["tomato", "tomatoes"], de: ["Tomate", "Tomaten"] },
  { id: "cherry-tomato", en: ["cherry tomatoes"], de: ["Kirschtomaten", "Cherrytomaten"] },
  // separate from chopped tomatoes
  { id: "peeled-tomatoes", en: ["peeled tomatoes", "whole peeled tomatoes"], de: ["geschälte Tomaten"] },
  // separate from peeled tomatoes; bare 'canned tomatoes'/'Dosentomaten' is ambiguous and left out
  { id: "chopped-tomatoes", en: ["chopped tomatoes"], de: ["gehackte Tomaten", "stückige Tomaten"] },
  { id: "tomato-paste", en: ["tomato paste", "tomato purée"], de: ["Tomatenmark"] },
  { id: "passata", en: ["passata"], de: ["Passata", "passierte Tomaten"] },
  // curly parsley not covered
  { id: "parsley", en: ["parsley", "flat-leaf parsley"], de: ["Petersilie", "glatte Petersilie"] },
  { id: "thyme", en: ["thyme"], de: ["Thymian"] },
  { id: "rosemary", en: ["rosemary", "fresh rosemary"], de: ["Rosmarin", "frischer Rosmarin"] },
  { id: "tarragon", en: ["tarragon"], de: ["Estragon"] },
  { id: "oregano", en: ["oregano", "dried oregano"], de: ["Oregano", "getrockneter Oregano"] },
  { id: "bay-leaf", en: ["bay leaf", "bay leaves"], de: ["Lorbeerblatt", "Lorbeerblätter"] },
  // NEVER the same as cumin
  { id: "caraway", en: ["caraway", "caraway seeds"], de: ["Kümmel"] },
  // NEVER the same as caraway/Kümmel
  { id: "cumin", en: ["cumin", "ground cumin"], de: ["Kreuzkümmel", "Cumin"] },
  { id: "turmeric", en: ["turmeric", "ground turmeric"], de: ["Kurkuma"] },
  // powder
  { id: "smoked-paprika", en: ["smoked paprika"], de: ["geräuchertes Paprikapulver", "Paprikapulver geräuchert"] },
  // vegetable, not powder; bare 'Paprika' is ambiguous
  { id: "bell-pepper-red", en: ["red pepper", "red peppers", "red bell pepper"], de: ["rote Paprika", "rote Paprikaschote"] },
  { id: "chilli-flakes", en: ["chilli flakes", "dried chilli flakes"], de: ["Chiliflocken"] },
  { id: "chilli-red", en: ["red chilli", "red chillies"], de: ["rote Chilischote", "rote Pfefferschote", "rote Pfefferschoten"] },
  { id: "ginger", en: ["ginger", "fresh ginger"], de: ["Ingwer", "frischer Ingwer"] },
  { id: "egg", en: ["egg", "eggs"], de: ["Ei", "Eier"] },
  { id: "egg-yolk", en: ["egg yolk", "egg yolks"], de: ["Eigelb"] },
  { id: "milk", en: ["milk"], de: ["Milch"] },
  // NEVER the same as milk
  { id: "coconut-milk", en: ["coconut milk"], de: ["Kokosmilch"] },
  { id: "cream", en: ["whipping cream", "heavy cream"], de: ["Schlagsahne", "Sahne"] },
  { id: "stock-vegetable", en: ["vegetable stock"], de: ["Gemüsebrühe"] },
  { id: "stock-chicken", en: ["chicken stock"], de: ["Hühnerbrühe"] },
  { id: "stock-beef", en: ["beef stock"], de: ["Rinderbrühe"] },
  { id: "red-wine", en: ["red wine"], de: ["Rotwein"] },
  { id: "white-wine", en: ["white wine"], de: ["Weißwein"] },
  { id: "balsamic-vinegar", en: ["balsamic vinegar"], de: ["Balsamico", "Balsamessig"] },
  { id: "mustard-english", en: ["English mustard"], de: ["Englischer Senf"] },
  { id: "spaghetti", en: ["spaghetti"], de: ["Spaghetti"] },
  { id: "basmati-rice", en: ["basmati rice"], de: ["Basmatireis"] },
  { id: "red-lentils", en: ["red lentils"], de: ["rote Linsen"] },
  { id: "feta", en: ["feta"], de: ["Feta"] },
  { id: "parmesan", en: ["parmesan"], de: ["Parmesan"] },
  { id: "capers", en: ["capers"], de: ["Kapern"] },
  { id: "peas", en: ["peas"], de: ["Erbsen"] },
  { id: "sugar-snap-peas", en: ["sugar snap peas", "snap peas"], de: ["Zuckerschoten"] },
  { id: "mushrooms", en: ["mushrooms", "button mushrooms"], de: ["Champignons"] },
  // whole chicken
  { id: "chicken", en: ["chicken"], de: ["Hähnchen", "Hühnchen"] },
  { id: "chicken-breast", en: ["chicken breast", "chicken breast fillets"], de: ["Hähnchenbrustfilet", "Hähnchenbrustfilets"] },
  { id: "chicken-thighs", en: ["chicken thighs"], de: ["Hähnchenschenkel", "Hähnchenkeulen"] },
  { id: "bacon-diced", en: ["diced bacon", "bacon cubes", "lardons"], de: ["Speckwürfel"] },
  { id: "prawns", en: ["prawns", "shrimp", "scampi"], de: ["Garnelen", "Scampi", "Scampis"] },
  { id: "seafood-mix", en: ["seafood mix", "mixed seafood"], de: ["Meeresfrüchte"] },
];
