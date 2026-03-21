import { describe, it, expect } from "vitest";
import {
  normalizePolishCapitalization,
  isPolishText,
  normalizePageCreatorResult,
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
