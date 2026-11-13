// Letter by letter roll. The parent element needs the class "roll-host" so hover and focus trigger it.
export default function RollText({ text }) {
  const letters = String(text).split("");
  function renderLetter(letter, index) {
    const shown = letter === " " ? " " : letter;
    return (
      <span className="rl" style={{ "--i": index }} key={index} aria-hidden="true">
        <span>{shown}</span>
        <span>{shown}</span>
      </span>
    );
  }
  return (
    <span className="roll">
      <span className="roll-sr">{text}</span>
      {letters.map(renderLetter)}
    </span>
  );
}
