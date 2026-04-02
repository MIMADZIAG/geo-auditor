import { useLocation } from "wouter";
import { ArrowLeft, Bot } from "lucide-react";

export default function Privacy() {
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
        <h1 className="text-3xl font-black mb-2 tracking-tight">Polityka prywatności</h1>
        <p className="text-xs text-muted-foreground mb-10">Ostatnia aktualizacja: 2 kwietnia 2026</p>
        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Administrator danych</h2>
            <p>Administratorem danych osobowych jest GEO-Auditor (dalej: „Usługa"). Kontakt w sprawach ochrony danych: <a href="mailto:privacy@geoauditor.app" className="text-primary hover:underline">privacy@geoauditor.app</a>.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. Jakie dane zbieramy</h2>
            <p>Zbieramy wyłącznie dane niezbędne do świadczenia Usługi:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Adresy URL przesyłane do analizy Signal Audit</li>
              <li>Adres IP (do celów ograniczenia liczby bezpłatnych audytów)</li>
              <li>Dane konta (imię, adres e-mail) — wyłącznie po rejestracji</li>
              <li>Dane płatności — przetwarzane wyłącznie przez Stripe, nie przechowujemy numerów kart</li>
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. Cel przetwarzania</h2>
            <p>Dane przetwarzamy w celu: świadczenia Usługi Signal Audit, zarządzania kontem użytkownika, obsługi płatności, zapobiegania nadużyciom oraz poprawy jakości Usługi.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Udostępnianie danych</h2>
            <p>Nie sprzedajemy danych osobowych. Dane mogą być przekazywane wyłącznie zaufanym podmiotom przetwarzającym (Stripe, dostawcy infrastruktury chmurowej) w zakresie niezbędnym do świadczenia Usługi.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. Prawa użytkownika</h2>
            <p>Masz prawo do: dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania oraz przenoszenia danych. Aby skorzystać z tych praw, skontaktuj się z nami pod adresem <a href="mailto:privacy@geoauditor.app" className="text-primary hover:underline">privacy@geoauditor.app</a>.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Cookies</h2>
            <p>Używamy wyłącznie niezbędnych plików cookie do zarządzania sesją użytkownika. Nie używamy cookies reklamowych ani śledzących.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Zmiany polityki</h2>
            <p>O istotnych zmianach polityki prywatności poinformujemy e-mailem lub komunikatem w Usłudze z co najmniej 14-dniowym wyprzedzeniem.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
