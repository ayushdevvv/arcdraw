import { useRef } from "react";

// Block style one time code input. Supports typing, backspace, arrow keys and pasting a full code.
export default function OtpInput({ value, onChange, length = 8, disabled = false, autoFocus = true }) {
  const refs = useRef([]);
  const digits = String(value || "").padEnd(length, " ").slice(0, length).split("");

  function focusAt(index) {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    if (target) {
      target.focus();
      target.select();
    }
  }

  function setDigit(index, digit) {
    const next = digits.slice();
    next[index] = digit || " ";
    onChange(next.join("").replace(/ +$/, "").replace(/ /g, ""));
  }

  function handleChange(index) {
    return function (event) {
      const raw = event.target.value.replace(/\D/g, "");
      if (!raw) {
        setDigit(index, "");
        return;
      }
      if (raw.length > 1) {
        const merged = (String(value || "").slice(0, index) + raw).slice(0, length);
        onChange(merged);
        focusAt(Math.min(merged.length, length - 1));
        return;
      }
      const current = String(value || "").slice(0, length);
      const padded = current.padEnd(index, "0");
      const merged = (padded.slice(0, index) + raw + current.slice(index + 1)).slice(0, length);
      onChange(merged);
      if (index < length - 1) focusAt(index + 1);
    };
  }

  function handleKeyDown(index) {
    return function (event) {
      if (event.key === "Backspace" && !digits[index].trim() && index > 0) {
        event.preventDefault();
        const current = String(value || "");
        onChange(current.slice(0, index - 1) + current.slice(index));
        focusAt(index - 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        focusAt(index + 1);
      }
    };
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusAt(Math.min(pasted.length, length - 1));
  }

  function renderBox(_, index) {
    const filled = Boolean(digits[index].trim());
    return (
      <input
        key={index}
        ref={function (node) { refs.current[index] = node; }}
        className={filled ? "otp-box is-filled" : "otp-box"}
        type="text"
        inputMode="numeric"
        autoComplete={index === 0 ? "one-time-code" : "off"}
        autoFocus={autoFocus && index === 0}
        maxLength={length}
        value={filled ? digits[index] : ""}
        disabled={disabled}
        aria-label={"Digit " + (index + 1) + " of " + length}
        onChange={handleChange(index)}
        onKeyDown={handleKeyDown(index)}
        onPaste={handlePaste}
        onFocus={function (event) { event.target.select(); }}
      />
    );
  }

  return <div className="otp-row" role="group" aria-label="Verification code">{Array.from({ length }).map(renderBox)}</div>;
}
