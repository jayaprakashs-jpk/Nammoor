// Relationship names. Keys are chains read from the viewer's side:
//   "F eB W" = my Father's elder Brother's Wife  ->  Periyamma
// Atoms: F M S D H W | eB yB B (elder, younger, unknown age brother) | eZ yZ Z (sisters).
//
// ta = Tamil, tr = Tamil in English letters, hi = North Indian, en = global English.
// Regional usage differs. This table is DATA on purpose: have a native speaker
// from each region review it and edit rows here, nothing else needs to change.

export interface Term {
  ta: string;
  tr: string;
  hi: string;
  en: string;
  /** Shown when the chain is ambiguous because ages are unknown. */
  hint?: string;
}

const t = (ta: string, tr: string, hi: string, en: string, hint?: string): Term => ({ ta, tr, hi, en, hint });
const AGE_HINT = "Add birth order or date of birth to know exactly.";

export const TERMS: Record<string, Term> = {
  // --- direct family ---
  F: t("அப்பா", "Appa", "Pitaji", "Father"),
  M: t("அம்மா", "Amma", "Mataji", "Mother"),
  S: t("மகன்", "Magan", "Beta", "Son"),
  D: t("மகள்", "Magal", "Beti", "Daughter"),
  H: t("கணவர்", "Kanavar", "Pati", "Husband"),
  W: t("மனைவி", "Manaivi", "Patni", "Wife"),
  eB: t("அண்ணா", "Anna", "Bhaiya", "Elder brother"),
  yB: t("தம்பி", "Thambi", "Chhota bhai", "Younger brother"),
  B: t("சகோதரன்", "Sagodharan", "Bhai", "Brother", AGE_HINT),
  eZ: t("அக்கா", "Akka", "Didi", "Elder sister"),
  yZ: t("தங்கை", "Thangai", "Chhoti behen", "Younger sister"),
  Z: t("சகோதரி", "Sagodhari", "Behen", "Sister", AGE_HINT),

  // --- grandparents and grandchildren ---
  "F F": t("தாத்தா", "Thatha", "Dada", "Grandfather", "Father's father"),
  "F M": t("பாட்டி", "Paati", "Dadi", "Grandmother", "Father's mother"),
  "M F": t("தாத்தா", "Thatha", "Nana", "Grandfather", "Mother's father"),
  "M M": t("பாட்டி", "Paati", "Nani", "Grandmother", "Mother's mother"),
  "S S": t("பேரன்", "Peran", "Pota", "Grandson", "Son's son"),
  "S D": t("பேத்தி", "Pethi", "Poti", "Granddaughter", "Son's daughter"),
  "D S": t("பேரன்", "Peran", "Nati", "Grandson", "Daughter's son"),
  "D D": t("பேத்தி", "Pethi", "Natin", "Granddaughter", "Daughter's daughter"),

  // --- father's side ---
  "F eB": t("பெரியப்பா", "Periyappa", "Tau", "Uncle", "Father's elder brother"),
  "F yB": t("சித்தப்பா", "Chithappa", "Chacha", "Uncle", "Father's younger brother"),
  "F B": t("பெரியப்பா / சித்தப்பா", "Periyappa / Chithappa", "Tau / Chacha", "Uncle", AGE_HINT),
  "F Z": t("அத்தை", "Athai", "Bua", "Aunt", "Father's sister"),
  "F eB W": t("பெரியம்மா", "Periyamma", "Tai", "Aunt", "Periyappa's wife"),
  "F yB W": t("சித்தி", "Chithi", "Chachi", "Aunt", "Chithappa's wife"),
  "F B W": t("பெரியம்மா / சித்தி", "Periyamma / Chithi", "Tai / Chachi", "Aunt", AGE_HINT),
  "F Z H": t("மாமா", "Mama", "Phupha", "Uncle", "Athai's husband"),

  // --- mother's side ---
  "M B": t("மாமா", "Mama", "Mama", "Uncle", "Mother's brother"),
  "M B W": t("மாமி", "Mami", "Mami", "Aunt", "Mama's wife"),
  "M eZ": t("பெரியம்மா", "Periyamma", "Mausi", "Aunt", "Mother's elder sister"),
  "M yZ": t("சித்தி", "Chithi", "Mausi", "Aunt", "Mother's younger sister"),
  "M Z": t("பெரியம்மா / சித்தி", "Periyamma / Chithi", "Mausi", "Aunt", AGE_HINT),
  "M eZ H": t("பெரியப்பா", "Periyappa", "Mausa", "Uncle", "Periyamma's husband"),
  "M yZ H": t("சித்தப்பா", "Chithappa", "Mausa", "Uncle", "Chithi's husband"),
  "M Z H": t("பெரியப்பா / சித்தப்பா", "Periyappa / Chithappa", "Mausa", "Uncle", AGE_HINT),

  // --- cross cousins (the "murai" relations) ---
  "M B S": t("மாமா மகன்", "Mama magan", "Mamera bhai", "Cousin", "Mama's son"),
  "M B D": t("மாமா மகள்", "Mama magal", "Mamera behen", "Cousin", "Mama's daughter"),
  "F Z S": t("அத்தை மகன்", "Athai magan", "Phuphera bhai", "Cousin", "Athai's son"),
  "F Z D": t("அத்தை மகள்", "Athai magal", "Phuphera behen", "Cousin", "Athai's daughter"),

  // --- marriage ---
  "W F": t("மாமனார்", "Maamanaar", "Sasur", "Father-in-law"),
  "H F": t("மாமனார்", "Maamanaar", "Sasur", "Father-in-law"),
  "W M": t("மாமியார்", "Maamiyaar", "Saas", "Mother-in-law"),
  "H M": t("மாமியார்", "Maamiyaar", "Saas", "Mother-in-law"),
  "S W": t("மருமகள்", "Marumagal", "Bahu", "Daughter-in-law"),
  "D H": t("மருமகன்", "Marumagan", "Damad", "Son-in-law"),
  "W B": t("மச்சான்", "Machan", "Saala", "Brother-in-law", "Wife's brother"),
  "W Z": t("மச்சினி", "Machini", "Saali", "Sister-in-law", "Wife's sister"),
  "H eB": t("மைத்துனர்", "Maithunar", "Jeth", "Brother-in-law", "Husband's elder brother"),
  "H yB": t("கொழுந்தன்", "Kozhundhan", "Devar", "Brother-in-law", "Husband's younger brother"),
  "H B": t("மைத்துனர் / கொழுந்தன்", "Maithunar / Kozhundhan", "Jeth / Devar", "Brother-in-law", AGE_HINT),
  "H Z": t("நாத்தனார்", "Naathanaar", "Nanad", "Sister-in-law", "Husband's sister"),
  "eB W": t("அண்ணி", "Anni", "Bhabhi", "Sister-in-law", "Elder brother's wife"),
  "yB W": t("தம்பி மனைவி", "Thambi manaivi", "Bhabhi", "Sister-in-law", "Younger brother's wife"),
  "B W": t("அண்ணி / தம்பி மனைவி", "Anni / Thambi manaivi", "Bhabhi", "Sister-in-law", AGE_HINT),
  "eZ H": t("அத்தான்", "Athan", "Jija", "Brother-in-law", "Elder sister's husband"),
  "yZ H": t("மச்சான்", "Machan", "Jija", "Brother-in-law", "Younger sister's husband"),
  "Z H": t("அத்தான் / மச்சான்", "Athan / Machan", "Jija", "Brother-in-law", AGE_HINT),
  "S W F": t("சம்மந்தி", "Samandhi", "Samdhi", "Co-father-in-law"),
  "S W M": t("சம்மந்தி", "Samandhi", "Samdhin", "Co-mother-in-law"),
  "D H F": t("சம்மந்தி", "Samandhi", "Samdhi", "Co-father-in-law"),
  "D H M": t("சம்மந்தி", "Samandhi", "Samdhin", "Co-mother-in-law"),
};

export const DISTANT: Term = t("உறவினர்", "Uravinar", "Rishtedar", "Relative");
export const SELF: Term = t("நீங்கள்", "Neengal", "Aap", "You");

// Built from the rules in engine.ts (great-grandparents, parallel cousins, nephews...).
export const GREAT: Record<number, { up: [string, string]; down: [string, string] }> = {
  3: { up: ["கொள்ளுத் தாத்தா", "கொள்ளுப் பாட்டி"], down: ["கொள்ளுப் பேரன்", "கொள்ளுப் பேத்தி"] },
  4: { up: ["எள்ளுத் தாத்தா", "எள்ளுப் பாட்டி"], down: ["எள்ளுப் பேரன்", "எள்ளுப் பேத்தி"] },
};
