import { AppShell } from '@/widgets/app-shell/AppShell';

export default function HomePage() {
  return (
    <main>
      <h1>Loqua</h1>
      <p className="status-line">
        Parle anglais, reçois une version naturelle expliquée. Ta voix ne quitte jamais cette
        machine.
      </p>
      <AppShell />
    </main>
  );
}
