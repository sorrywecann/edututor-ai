import type { LucideIcon } from 'lucide-react';
import { FileText, Lightbulb, Layers, HelpCircle, Brain, Search, ListChecks, Radio } from 'lucide-react';

export interface StudyTool {
  icon: LucideIcon;
  label: string;
  prompt: string;
  autoSave: boolean;
  description?: string;
}

export const STUDY_TOOLS: StudyTool[] = [
  {
    icon: FileText, label: 'Zhrnutie',
    description: 'Krátky výstižný prehľad',
    autoSave: true,
    prompt: 'Napíš stručné výstižné zhrnutie hlavných bodov z dokumentov (max 250 slov). Plynulý text v 2-3 odsekoch. Cituj zdroje ako [Zdroj N] inline v texte. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy, žiadne odrážky "-" alebo "*", žiadne `code`. Iba čistá próza.',
  },
  {
    icon: Lightbulb, label: 'Kľúčové body',
    description: '8–12 najdôležitejších faktov',
    autoSave: true,
    prompt: 'Identifikuj 8-12 najdôležitejších bodov z dokumentov. Každý bod začni číslom a bodkou (napr. "1. ", "2. ") na novom riadku a napíš ho ako jednu jasnú vetu: čo to je a prečo je to dôležité. Zoraď od najdôležitejšieho. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy, žiadne odrážky "-" alebo "*".',
  },
  {
    icon: Layers, label: 'Kartičky',
    description: 'Flashcards na zapamätanie',
    autoSave: true,
    prompt: 'Vytvor 12-15 flashcard kartičiek z dokumentov. Pre každú presný formát:\nOtázka: [jasná, konkrétna otázka]\nOdpoveď: [stručná, presná odpoveď]\n\nMedzi kartičkami nechaj prázdny riadok. Pokry rôzne témy. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy, žiadne odrážky "-" alebo "*".',
  },
  {
    icon: HelpCircle, label: 'Otázky',
    description: '10 cvičných otázok',
    autoSave: true,
    prompt: 'Vytvor 10 otázok na precvičenie z dokumentov. Formát pre každú:\n\n1. [otázka]\nOdpoveď: [odpoveď]\n\nMedzi otázkami prázdny riadok. Zahrň mix: 4 faktické, 3 aplikačné, 3 analytické. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy, žiadne odrážky "-".',
  },
  {
    icon: Brain, label: 'Jednoducho',
    description: 'Vysvetlenie pre začiatočníka',
    autoSave: true,
    prompt: 'Vysvetli obsah dokumentov jednoduchým jazykom, ako keby si to vysvetľoval 15-ročnému. Plynulý text v odsekoch, analógie a príklady z bežného života. Ak musíš použiť odborný termín, ihneď ho vysvetli v zátvorke. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy, žiadne odrážky.',
  },
  {
    icon: Search, label: 'Analýza',
    description: '5-bodová kritická analýza',
    autoSave: true,
    prompt: 'Urob hlbokú analýzu dokumentov v piatich krátkych sekciách, každá ako samostatný odsek (2-3 vety):\n\n1. SILNÉ STRÁNKY — čo je najcennejšie\n2. SLABÉ STRÁNKY — čo chýba alebo je nedostatočné\n3. KĽÚČOVÉ ZÁVERY — hlavné posolstvo\n4. OTVORENÉ OTÁZKY — čo dokumenty neriešia\n5. ODPORÚČANIA — čo by mal čitateľ urobiť ďalej\n\nKaždú sekciu nadpíš číslom a názvom veľkými písmenami ako vyššie (bez markdownu). Buď kritický a konkrétny. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy.',
  },
  {
    icon: ListChecks, label: 'Akčné body',
    description: 'Konkrétne úlohy a kroky',
    autoSave: true,
    prompt: 'Extrahuj z dokumentov všetky akčné body, úlohy a odporúčania. Pre každý jeden riadok vo formáte:\n\n✅ [akčný bod] — [prečo / kontext]\n\nMedzi bodmi prázdny riadok. Zoraď podľa priority (najdôležitejšie prvé). Ak dokumenty neobsahujú explicitné úlohy, odvoď ich z obsahu. ŽIADNY markdown — žiadne **tučné**, žiadne ## nadpisy, žiadne "-" alebo "*" odrážky.',
  },
  {
    icon: Radio, label: 'Podcast',
    description: 'Audio prehľad z dokumentov',
    autoSave: false,
    prompt: '__podcast__',
  },
];
