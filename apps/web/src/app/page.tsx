import { CorrectionSession } from '@/widgets/correction-session/CorrectionSession';

export default function HomePage() {
  return (
    <main>
      <h1>Loqua</h1>
      <p className="status-line">
        Parle anglais, reçois une version naturelle expliquée. Ta voix ne quitte jamais cette
        machine.
      </p>
      <CorrectionSession />
    </main>
  );
}
