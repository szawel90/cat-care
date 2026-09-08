export default function HomePage() {
  return (
    <main className="shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          c.
        </span>{' '}
        Cat Care
      </header>
      <section className="intro" aria-labelledby="intro-title">
        <p className="eyebrow">A little understanding goes a long way</p>
        <h1 id="intro-title">
          Care starts with
          <br />
          <em>understanding.</em>
        </h1>
        <p className="description">
          A thoughtful space to understand your cat, ask better questions, and find guidance
          reviewed by a human expert.
        </p>
        <div className="status">
          <span aria-hidden="true" /> In development
        </div>
      </section>
      <div className="principles" aria-label="Our approach">
        <p>
          <span>01</span> Every cat has a story.
        </p>
        <p>
          <span>02</span> Good questions come first.
        </p>
        <p>
          <span>03</span> Expertise makes the difference.
        </p>
      </div>
      <footer>Made for the life you share.</footer>
    </main>
  );
}
