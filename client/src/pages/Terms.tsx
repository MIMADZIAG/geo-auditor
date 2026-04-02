import { useLocation } from "wouter";
import { ArrowLeft, Bot } from "lucide-react";

export default function Terms() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 glass-strong border-b border-border/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Strona główna</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Bot className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">GEO-Auditor</span>
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-3xl font-black mb-2 tracking-tight">Regulamin Usługi</h1>
        <p className="text-xs text-muted-foreground mb-10">Ostatnia aktualizacja: 2 kwietnia 2026</p>
        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Postanowienia ogólne</h2>
            <p>Niniejszy Regulamin określa zasady korzystania z platformy GEO-Auditor (dalej: „Usługa"), dostępnej pod adresem geoauditor.app. Korzystanie z Usługi oznacza akceptację niniejszego Regulaminu.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. Zakres Usługi</h2>
            <p>GEO-Auditor to platforma SaaS do analizy widoczności stron internetowych w silnikach AI Search (Signal Audit, Citation Intelligence, Signal Rewrite, Pulse Monitor). Usługa dostępna jest w planach: Free (1 audyt bezpłatnie), Starter ($59/mies.) i Pro ($99/mies.).</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. Konto użytkownika</h2>
            <p>Rejestracja konta jest wymagana do korzystania z funkcji zaawansowanych (historia audytów, Pulse Monitor, Signal Rewrite). Użytkownik odpowiada za bezpieczeństwo danych logowania. Konto może być usunięte na żądanie użytkownika.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Płatności i anulowanie</h2>
            <p>Płatności obsługiwane są przez Stripe. Subskrypcje płatne są z góry (miesięcznie lub rocznie). Anulowanie subskrypcji możliwe jest w dowolnym momencie z poziomu Command Center — dostęp do płatnych funkcji pozostaje aktywny do końca opłaconego okresu. Nie oferujemy zwrotów za niewykorzystany okres subskrypcji.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. Dozwolone użycie</h2>
            <p>Usługa przeznaczona jest do analizy stron, do których użytkownik ma prawo dostępu lub jest ich właścicielem. Zabrania się używania Usługi do analizy stron w sposób naruszający prawa osób trzecich, automatycznego masowego pobierania wyników (scraping) bez zgody oraz działań sprzecznych z prawem.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Ograniczenie odpowiedzialności</h2>
            <p>GEO-Auditor dostarcza rekomendacji opartych na analizie algorytmicznej i modelach AI. Wyniki mają charakter informacyjny i nie stanowią gwarancji poprawy widoczności. Usługa świadczona jest „tak jak jest" (as-is). Nie ponosimy odpowiedzialności za decyzje biznesowe podjęte na podstawie wyników audytów.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Zmiany Regulaminu</h2>
            <p>O istotnych zmianach Regulaminu poinformujemy e-mailem z co najmniej 14-dniowym wyprzedzeniem. Dalsze korzystanie z Usługi po wejściu zmian w życie oznacza ich akceptację.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. Kontakt</h2>
            <p>W sprawach dotyczących Regulaminu: <a href="mailto:hello@geoauditor.app" className="text-primary hover:underline">hello@geoauditor.app</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
