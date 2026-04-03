export interface ParsedScope {
  tab: string;
  csi: string;
  specTitle: string;
  lines: Array<{ callout: string; desc: string; model: string; qty: number }>;
}

export interface ParsedWorkbook {
  project: string;
  scopes: ParsedScope[];
}

const MOCK_PARSED_DATA: ParsedWorkbook = {
  project: "Sample Project",
  scopes: [
    {
      tab: "Toilet Accessories",
      csi: "10 28 00",
      specTitle: "Toilet Bath and Laundry Accessories",
      lines: [
        { callout: "BCS2", desc: "Horizontal, Recessed Mounted Baby Changing Station - Stainless", model: "KB310-SSRE", qty: 18 },
        { callout: "CH1", desc: "Hat and Coat Hook", model: "9134-000000", qty: 31 },
        { callout: "GB18V", desc: "Straight Grab Bar – 18\" Length", model: "8320-001180", qty: 19 },
        { callout: "GB36", desc: "Straight Grab Bar – 36\" Length", model: "8320-001360", qty: 19 },
        { callout: "GB42", desc: "Straight Grab Bar – 42\" Length", model: "8320-001420", qty: 23 },
        { callout: "PTD1", desc: "Paper Towel Dispenser", model: "GP Pro 59488A", qty: 29 },
        { callout: "SNDP1", desc: "Sanitary Napkin Disposal, 1.2-Gal.", model: "4722-150000", qty: 29 },
        { callout: "SPD-01", desc: "Touchless Soap Dispenser - Polished Chrome", model: "ESD-200", qty: 31 },
        { callout: "TSCD", desc: "Toilet Seat Cover Dispenser", model: "5831-000000", qty: 35 },
        { callout: "TTD3", desc: "Multi-Roll Toilet Tissue Dispenser – ConturaSeries", model: "5A00-000000", qty: 39 },
        { callout: "WR2", desc: "Waste Receptacle, 12-Gal.", model: "344-000000", qty: 19 },
      ],
    },
    {
      tab: "Fire Extinguishers",
      csi: "10 44 00",
      specTitle: "Fire Protection Specialties",
      lines: [
        { callout: "FEC", desc: "Fire Extinguisher + Tagging", model: "FE10C Cosmic 10E", qty: 24 },
        { callout: "FEC", desc: "Fire Extinguisher Cabinet – Ambassador Series, Clear Acrylic, White", model: "C1016V10", qty: 24 },
        { callout: "FEC", desc: "Fire Extinguisher Arrow Tent Sign", model: "24S", qty: 24 },
      ],
    },
    {
      tab: "Wall Protection",
      csi: "10 26 00",
      specTitle: "Wall and Door Protection",
      lines: [
        { callout: "CG-A1", desc: "Corner Guard, 90 degree, flush mounted, 3\" legs, 12'-0\" Height", model: "Acrovyn 4000 FS-20N", qty: 65 },
        { callout: "EG-A1", desc: "End Wall Corner Guard, flush mounted", model: "Acrovyn 4000 FS-25N", qty: 9 },
        { callout: "CR-1", desc: "Bumper Guard, 2-3/4\" exposed face, 12'L", model: "Acrovyn 4000 BG-30N", qty: 10 },
        { callout: "CR-1", desc: "Bumper Guard End Caps", model: "Acrovyn 4000 End cap BG30N", qty: 20 },
      ],
    },
    {
      tab: "Toilet Compartments",
      csi: "10 21 13",
      specTitle: "Toilet Compartments",
      lines: [
        { callout: "N/A", desc: "Floor Mounted Overhead Braced Solid Plastic Partitions - POLY Stalls, 72\" Tall", model: "Toilet Compartment", qty: 30 },
        { callout: "N/A", desc: "Wall Mounted Solid Plastic POLY Screen 24\" x 55\"", model: "Urinal Screen", qty: 1 },
      ],
    },
    {
      tab: "Visual Display",
      csi: "10 11 00",
      specTitle: "Visual Display Units",
      lines: [
        { callout: "Map Rail", desc: "Display Reveal End Cap - Silver", model: "B0005AS", qty: 6 },
        { callout: "Map Rail", desc: "Display Reveal - Silver, 60 in", model: "A1024", qty: 12 },
      ],
    },
  ],
};

export async function parseEstimateWorkbook(_fileName: string): Promise<ParsedWorkbook> {
  return new Promise((resolve) => {
    setTimeout(() => { resolve(MOCK_PARSED_DATA); }, 1500);
  });
}
