import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Set the room",
    accent: "text-gold",
    body: "The host chooses 2–5 teams. Everyone joins on a phone, picks a team, and each team needs a captain before play starts.",
  },
  {
    number: "02",
    title: "Face-off",
    accent: "text-neon",
    body: "One designated rep per team buzzes. The first valid buzz wins control and gives the board’s first official answer.",
  },
  {
    number: "03",
    title: "Answer down the line",
    accent: "text-gold",
    body: "The controlling team rotates through its players in join order. One player is up at a time, gets 10 seconds, and sends one official answer. No coaching.",
  },
  {
    number: "04",
    title: "Host judges",
    accent: "text-bubble",
    body: "The host matches an answer to the survey board or gives a strike. A reveal passes the mic; three strikes open a steal.",
  },
  {
    number: "05",
    title: "Steal the bank",
    accent: "text-neon",
    body: "Opposing teams get 15 seconds to huddle. Each captain secretly locks one steal answer; the host reveals and judges them together.",
  },
  {
    number: "06",
    title: "Settle a matching steal",
    accent: "text-gold",
    body: "If two or more teams match the same top survey answer, their captains secretly throw rock-paper-scissors. Throws reveal together; a tie rethrows.",
  },
];

export default function RulesPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-[min(96vw,72rem)] flex-col gap-8 px-4 py-10 md:py-14">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/" className="label text-neon transition hover:text-white">← Back to Feud Night</Link>
          <h1 className="display mt-3 text-5xl leading-none sm:text-7xl">
            Game <span className="text-gold">Flow</span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-paper/65">The quick, spoiler-free rules card for hosts and players.</p>
        </div>
        <div className="surface max-w-xs p-4 text-sm leading-relaxed text-paper/65">
          <span className="label block text-gold">Scoring</span>
          Boards 1–2 are normal, boards 3–4 are double, and the final fifth board is triple. The whole revealed bank goes to the winning team.
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <article key={step.number} className="surface flex min-h-52 flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <span className={`display text-3xl ${step.accent}`}>{step.number}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${step.accent === "text-gold" ? "bg-gold" : step.accent === "text-neon" ? "bg-neon" : "bg-bubble"}`}
              />
            </div>
            <h2 className="display text-2xl text-white">{step.title}</h2>
            <p className="text-sm leading-relaxed text-paper/65">{step.body}</p>
          </article>
        ))}
      </section>

      <section className="surface grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
        <div>
          <span className="label text-bubble">Captain&apos;s job</span>
          <p className="mt-2 text-paper/70">Captains submit the team&apos;s secret steal answer and play RPS only if their steal ties. Main-board answers belong to whoever is up in the rotation.</p>
        </div>
        <Link href="/" className="btn-gold px-6 py-4 text-center">Host a game</Link>
      </section>
    </main>
  );
}
