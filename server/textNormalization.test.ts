import { describe, it, expect } from "vitest";
import {
  normalizePolishCapitalization,
  isPolishText,
  normalizePageCreatorResult,
  applyPolishSentenceCase,
  normalizePolishHeadings,
  normalizePolishContent,
  normalizePageCreatorResultFull,
} from "./utils/textNormalization";

describe("isPolishText", () => {
  it("detects Polish diacritics", () => {
    expect(isPolishText("Zoptymalizuj swoją stronę")).toBe(true);
  });
  it("detects common Polish words", () => {
    expect(isPolishText("To jest przykład tekstu")).toBe(true);
  });
  it("returns false for English text", () => {
    expect(isPolishText("This is an example of English text without any special characters")).toBe(false);
  });
});

describe("normalizePolishCapitalization", () => {
  it("lowercases word after colon in Polish", () => {
    const input = "Wymagania: Dobra znajomość JavaScript";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Wymagania: dobra znajomość JavaScript");
  });

  it("lowercases word after hyphen in Polish", () => {
    const input = "Kategoria - Elektronika";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Kategoria - elektronika");
  });

  it("lowercases word after em dash in Polish", () => {
    const input = "Opis — Bardzo dobry produkt";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Opis — bardzo dobry produkt");
  });

  it("lowercases word after en dash in Polish", () => {
    const input = "Cena – Wysoka jakość";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Cena – wysoka jakość");
  });

  it("lowercases word after slash in Polish", () => {
    const input = "Kategoria / Podkategoria";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Kategoria / podkategoria");
  });

  it("lowercases word after bullet in Polish", () => {
    const input = "• Ważna informacja";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("• ważna informacja");
  });

  it("preserves acronyms after colon", () => {
    const input = "Technologia: SEO i GEO";
    const result = normalizePolishCapitalization(input, "pl");
    // SEO and GEO are acronyms — should remain uppercase
    expect(result).toBe("Technologia: SEO i GEO");
  });

  it("preserves acronym AI after colon", () => {
    const input = "Narzędzie: AI Search Visibility";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Narzędzie: AI Search Visibility");
  });

  it("does NOT modify English text (language=en)", () => {
    const input = "Category: Electronics and Gadgets";
    const result = normalizePolishCapitalization(input, "en");
    expect(result).toBe("Category: Electronics and Gadgets");
  });

  it("does NOT modify English text (auto-detect)", () => {
    const input = "Category: Electronics and Gadgets without any Polish characters";
    const result = normalizePolishCapitalization(input);
    expect(result).toBe("Category: Electronics and Gadgets without any Polish characters");
  });

  it("does NOT modify Markdown headings", () => {
    const input = "## Sekcja: Ważna Informacja";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("## Sekcja: Ważna Informacja");
  });

  it("does NOT modify lines inside code blocks", () => {
    const input = "```\nKlucz: Wartość\n```";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("```\nKlucz: Wartość\n```");
  });

  it("handles multiple occurrences on same line", () => {
    const input = "Zalety: Szybki, Tani - Dobry wybór";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Zalety: szybki, Tani - dobry wybór");
  });

  it("handles Polish diacritics in capital letters", () => {
    const input = "Opis: Ładny produkt";
    const result = normalizePolishCapitalization(input, "pl");
    expect(result).toBe("Opis: ładny produkt");
  });

  it("preserves sentence-starting capitals (no punctuation before)", () => {
    const input = "To jest zdanie. Następne zdanie zaczyna się wielką literą.";
    const result = normalizePolishCapitalization(input, "pl");
    // Sentence-starting capitals should not be affected (no : - – — / | • before them)
    expect(result).toBe("To jest zdanie. Następne zdanie zaczyna się wielką literą.");
  });
});

// ─── applyPolishSentenceCase ──────────────────────────────────────────────────

describe("applyPolishSentenceCase", () => {
  it("lowercases all non-first words in a typical Polish heading", () => {
    expect(applyPolishSentenceCase("Jak Wybrać Najlepszą Kurtkę Zimową"))
      .toBe("Jak wybrać najlepszą kurtkę zimową");
  });

  it("preserves ALL-CAPS acronyms in subsequent words", () => {
    // 'AI' and 'GEO' are all-caps acronyms -> preserved
    // 'ChatGPT' is CamelCase brand -> preserved
    // 'Search' is a regular English word -> lowercased (sentence case)
    // 'I' is a single letter -> lowercased (Polish conjunction 'i')
    expect(applyPolishSentenceCase("Optymalizacja Pod AI Search I ChatGPT"))
      .toBe("Optymalizacja pod AI search i ChatGPT");
  });

  it("lowercases regular proper nouns (no NLP available)", () => {
    // Design decision: without NLP/NER, we cannot distinguish 'Juliusza Kossaka' (proper noun)
    // from 'Najlepszą Kurtkę' (regular words). Both get lowercased.
    // The LLM prompt instructs the model to write sentence case directly,
    // so proper nouns like 'Juliusz Kossak' will already be correctly cased in LLM output
    // and the post-processor won't need to touch them.
    expect(applyPolishSentenceCase("Zobacz Obrazy Juliusza Kossaka"))
      .toBe("Zobacz obrazy juliusza kossaka");
  });

  it("preserves SEO, GEO, FAQ acronyms", () => {
    // SEO, GEO are all-caps acronyms -> preserved; 'I' is single letter -> lowercased
    expect(applyPolishSentenceCase("Najlepsze Praktyki SEO I GEO"))
      .toBe("Najlepsze praktyki SEO i GEO");
  });

  it("preserves CamelCase brand names like WordPress, WooCommerce", () => {
    expect(applyPolishSentenceCase("Jak Zainstalować WooCommerce Na WordPress"))
      .toBe("Jak zainstalować WooCommerce na WordPress");
  });

  it("keeps first word capitalised even if it was lowercase", () => {
    expect(applyPolishSentenceCase("jak wybrać produkt"))
      .toBe("Jak wybrać produkt");
  });

  it("handles single-word heading", () => {
    expect(applyPolishSentenceCase("Podsumowanie")).toBe("Podsumowanie");
  });

  it("handles heading with question mark", () => {
    expect(applyPolishSentenceCase("Jak Wybrać Najlepszy Produkt?"))
      .toBe("Jak wybrać najlepszy produkt?");
  });

  it("lowercases regular words with Polish diacritics (no NLP for proper nouns)", () => {
    // Without NLP, 'Łódź' and 'Warszawa' are treated as regular words and lowercased.
    // The LLM prompt ensures proper nouns are already correctly cased in its output.
    expect(applyPolishSentenceCase("Sklepy W Łódź I Warszawa"))
      .toBe("Sklepy w łódź i warszawa");
  });

  it("does NOT modify English headings (all words uppercase is normal)", () => {
    // English heading — sentence case should NOT be applied (caller's responsibility)
    // applyPolishSentenceCase is PL-only; this test just verifies it doesn't crash
    const result = applyPolishSentenceCase("How To Choose The Best Product");
    // First word stays, rest lowercased (this is expected — caller must check language)
    expect(result[0]).toBe("H");
  });
});

// ─── normalizePolishHeadings ──────────────────────────────────────────────────

describe("normalizePolishHeadings", () => {
  it("normalizes Markdown headings to sentence case in Polish", () => {
    const input = "## Jak Wybrać Najlepszą Kurtkę Zimową\n\nTreść akapitu.";
    const result = normalizePolishHeadings(input, "pl");
    expect(result).toContain("## Jak wybrać najlepszą kurtkę zimową");
  });

  it("does NOT normalize Markdown headings in English", () => {
    const input = "## How To Choose The Best Product\n\nContent here.";
    const result = normalizePolishHeadings(input, "en");
    expect(result).toBe(input);
  });

  it("normalizes plain-text headings (LLM rewrite output) in Polish", () => {
    // Plain-text heading surrounded by blank lines with title-case pattern
    const input = "\nJak Wybrać Najlepszą Kurtkę Zimową\n\nTreść akapitu z wieloma słowami opisującymi produkt.";
    const result = normalizePolishHeadings(input, "pl");
    expect(result).toContain("Jak wybrać najlepszą kurtkę zimową");
  });

  it("preserves acronyms in Markdown headings", () => {
    // AI, GEO are all-caps acronyms -> preserved; 'Search' is a regular word -> lowercased
    const input = "## Optymalizacja Pod AI Search I GEO";
    const result = normalizePolishHeadings(input, "pl");
    expect(result).toBe("## Optymalizacja pod AI search i GEO");
  });

  it("does NOT touch body text (long lines with periods)", () => {
    const input = "To jest długi akapit z wieloma zdaniami. Każde zdanie jest kompletne i zakończone kropką. Nie powinien być traktowany jako nagłówek.";
    const result = normalizePolishHeadings(input, "pl");
    expect(result).toBe(input);
  });

  it("does NOT touch code blocks", () => {
    const input = "```\nJak Wybrać Produkt\n```";
    const result = normalizePolishHeadings(input, "pl");
    expect(result).toBe(input);
  });

  it("is a no-op for English content (auto-detect)", () => {
    // Text without Polish diacritics or unambiguous Polish words -> auto-detected as English
    const input = "## How To Choose The Best Product\n\nContent here, all English words only.";
    const result = normalizePolishHeadings(input);
    expect(result).toBe(input);
  });
});

// ─── normalizePolishContent ───────────────────────────────────────────────────

describe("normalizePolishContent", () => {
  it("applies both heading and punctuation normalisation", () => {
    const input = "## Jak Wybrać Najlepszy Produkt\n\nZalety: Szybki, Tani - Dobry wybór dla każdego.";
    const result = normalizePolishContent(input, "pl");
    expect(result).toContain("## Jak wybrać najlepszy produkt");
    expect(result).toContain("Zalety: szybki, Tani - dobry wybór");
  });

  it("is a no-op for English content", () => {
    const input = "## How To Choose The Best Product\n\nCategory: Electronics and Gadgets";
    const result = normalizePolishContent(input, "en");
    expect(result).toBe(input);
  });
});

// ─── normalizePageCreatorResult (legacy) ─────────────────────────────────────

describe("normalizePageCreatorResult", () => {
  it("normalizes string fields in result object", () => {
    const result = {
      // "Najlepsza" is directly after ":" — should be lowercased
      // "Opcja" is NOT after a punctuation sign — should remain as-is
      pageTitle: "Produkt: Najlepsza opcja",
      // "Bardzo" is directly after "-" — should be lowercased
      answerFirstParagraph: "Opis - Bardzo dobry",
      sections: [{ heading: "Sekcja", content: "Treść: Ważna informacja" }],
      faq: [{ question: "Pytanie?", answer: "Odpowiedź: Tak, oczywiście" }],
    };
    const normalized = normalizePageCreatorResult(result as Record<string, unknown>, "pl");
    // "Najlepsza" after ":" → lowercased
    expect((normalized as typeof result).pageTitle).toBe("Produkt: najlepsza opcja");
    // "Bardzo" after "-" → lowercased
    expect((normalized as typeof result).answerFirstParagraph).toBe("Opis - bardzo dobry");
    expect((normalized as typeof result).sections[0].content).toBe("Treść: ważna informacja");
    expect((normalized as typeof result).faq[0].answer).toBe("Odpowiedź: tak, oczywiście");
  });

  it("does NOT normalize English results", () => {
    const result = {
      pageTitle: "Product: Best Option",
      answerFirstParagraph: "Description - Very Good",
    };
    const normalized = normalizePageCreatorResult(result as Record<string, unknown>, "en");
    expect((normalized as typeof result).pageTitle).toBe("Product: Best Option");
    expect((normalized as typeof result).answerFirstParagraph).toBe("Description - Very Good");
  });
});

// ─── normalizePageCreatorResultFull ──────────────────────────────────────────

describe("normalizePageCreatorResultFull", () => {
  it("applies sentence case to heading fields in Polish", () => {
    const result = {
      heading: "Jak Wybrać Najlepszą Kurtkę Zimową",
      content: "Treść: Ważna informacja dla kupujących.",
    };
    const normalized = normalizePageCreatorResultFull(result as Record<string, unknown>, "pl");
    expect((normalized as typeof result).heading).toBe("Jak wybrać najlepszą kurtkę zimową");
    expect((normalized as typeof result).content).toBe("Treść: ważna informacja dla kupujących.");
  });

  it("preserves acronyms in heading fields", () => {
    // AI, GEO are all-caps acronyms -> preserved; 'Search' is a regular word -> lowercased
    const result = {
      heading: "Optymalizacja Pod AI Search I GEO",
    };
    const normalized = normalizePageCreatorResultFull(result as Record<string, unknown>, "pl");
    expect((normalized as typeof result).heading).toBe("Optymalizacja pod AI search i GEO");
  });

  it("does NOT normalize English results", () => {
    const result = {
      heading: "How To Choose The Best Product",
      content: "Category: Electronics and Gadgets",
    };
    const normalized = normalizePageCreatorResultFull(result as Record<string, unknown>, "en");
    expect((normalized as typeof result).heading).toBe("How To Choose The Best Product");
    expect((normalized as typeof result).content).toBe("Category: Electronics and Gadgets");
  });

  it("normalizes nested objects recursively", () => {
    const result = {
      sections: [
        { heading: "Jak Wybrać Produkt", content: "Opis: Dobry wybór" },
        { heading: "Zalety I Wady", content: "Zalety: Szybki" },
      ],
    };
    const normalized = normalizePageCreatorResultFull(result as Record<string, unknown>, "pl");
    const sections = (normalized as typeof result).sections;
    expect(sections[0].heading).toBe("Jak wybrać produkt");
    expect(sections[0].content).toBe("Opis: dobry wybór");
    expect(sections[1].heading).toBe("Zalety i wady");
  });
});
