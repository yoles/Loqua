import { HomePage } from '@/views/home/HomePage';

export default function Home() {
  return (
    <main>
      <h1>Loqua</h1>
      <p className="status-line">
        Parle anglais, reçois une version naturelle expliquée. Ta voix ne quitte jamais cette
        machine.
      </p>
      <HomePage />
    </main>
  );
}
