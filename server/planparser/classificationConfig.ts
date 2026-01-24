import type { PlanParserScope } from "@shared/schema";

export interface ScopeConfig {
  name: PlanParserScope;
  includeKeywords: string[];
  boostPhrases: string[];
  weight: number;
}

export interface ClassificationConfig {
  scopes: ScopeConfig[];
  signageExclusionKeywords: string[];
  signageOverrideThreshold: number;
  millworkExclusionKeywords: string[];
  scheduleBoostMultiplier: number;
  minConfidenceThreshold: number;
}

export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  scopes: [
    {
      name: "Toilet Accessories",
      includeKeywords: [
        "toilet accessories", "bath accessories", "restroom accessories",
        "grab bar", "soap dispenser", "paper towel", "hand dryer",
        "mirror", "toilet paper holder", "sanitary napkin", "waste receptacle",
        "seat cover dispenser", "robe hook", "towel bar", "shower rod",
        "baby changing", "diaper station", "10 28", "102800"
      ],
      boostPhrases: ["toilet accessory schedule", "restroom accessory", "bath accessory"],
      weight: 1.0
    },
    {
      name: "Toilet Partitions",
      includeKeywords: [
        "toilet partition", "toilet compartment", "restroom partition",
        "bathroom partition", "urinal screen", "privacy screen",
        "phenolic partition", "solid plastic partition", "stainless steel partition",
        "powder coated partition", "overhead braced", "floor mounted",
        "ceiling hung", "10 21", "102113", "102100"
      ],
      boostPhrases: ["partition schedule", "toilet compartment detail", "enlarged restroom plan"],
      weight: 1.0
    },
    {
      name: "Wall Protection",
      includeKeywords: [
        "wall protection", "corner guard", "crash rail", "handrail",
        "bumper guard", "wall guard", "chair rail", "door frame protector",
        "impact protection", "surface protection", "finish protection",
        "10 26", "102600"
      ],
      boostPhrases: ["wall protection schedule", "corner guard detail"],
      weight: 1.0
    },
    {
      name: "Fire Extinguisher Cabinets",
      includeKeywords: [
        "fire extinguisher", "fire cabinet", "extinguisher cabinet",
        "fec", "fire protection cabinet", "fire suppression",
        "abc extinguisher", "fire hose cabinet", "10 44", "104413", "104416"
      ],
      boostPhrases: ["fire extinguisher schedule", "fec location", "fire cabinet detail"],
      weight: 1.0
    },
    {
      name: "Cubicle Curtains",
      includeKeywords: [
        "cubicle curtain", "cubicle track", "privacy curtain",
        "hospital curtain", "exam curtain", "curtain track",
        "ceiling track", "mesh curtain", "anti-microbial curtain",
        "10 21 23", "102123"
      ],
      boostPhrases: ["cubicle curtain schedule", "curtain track layout"],
      weight: 1.0
    },
    {
      name: "Visual Display",
      includeKeywords: [
        "markerboard", "whiteboard", "tackboard", "bulletin board",
        "display case", "trophy case", "projection screen",
        "chalkboard", "visual display", "writing surface",
        "display board", "cork board", "fabric board",
        "10 11", "101100"
      ],
      boostPhrases: ["visual display schedule", "markerboard detail", "tackboard schedule"],
      weight: 1.0
    },
    {
      name: "Lockers",
      includeKeywords: [
        "locker", "metal locker", "wood locker", "plastic locker",
        "athletic locker", "gym locker", "employee locker",
        "storage locker", "locker room", "locker bench",
        "10 51", "105100", "105113"
      ],
      boostPhrases: ["locker schedule", "locker room plan", "locker detail"],
      weight: 1.0
    },
    {
      name: "Shelving",
      includeKeywords: [
        "shelving", "wire shelving", "closet shelving", "adjustable shelving",
        "metal shelving", "storage shelving", "shelf bracket", "shelf standard",
        "10 56", "105600"
      ],
      boostPhrases: ["shelving schedule", "shelf detail"],
      weight: 1.0
    },
    {
      name: "Other Div10",
      includeKeywords: [
        "division 10", "div 10", "specialties", "toilet specialties",
        "building specialties", "owner furnished", "install by others",
        "postal specialties", "telephone enclosure", "wardrobe",
        "protective cover", "entrance mat", "flagpole"
      ],
      boostPhrases: ["division 10 schedule", "specialty schedule"],
      weight: 0.8
    }
  ],
  signageExclusionKeywords: [
    "signage", "sign schedule", "room sign", "door sign",
    "wayfinding", "directional sign", "ada sign", "braille sign",
    "room number", "room identification", "sign type",
    "exterior signage", "interior signage", "monument sign",
    "10 14", "101400", "signage specification"
  ],
  signageOverrideThreshold: 0.6,
  millworkExclusionKeywords: [
    "millwork", "casework", "cabinet", "countertop", "woodwork",
    "custom cabinet", "built-in cabinet", "reception desk",
    "nurse station", "millwork schedule", "casework schedule",
    "wood veneer", "plastic laminate cabinet", "upper cabinet", "base cabinet"
  ],
  scheduleBoostMultiplier: 1.5,
  minConfidenceThreshold: 25
};
