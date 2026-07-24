import { useState } from "react";

type EditableField = HTMLInputElement | HTMLTextAreaElement;

type DesktopVirtualKeyboardProps = {
  activeField: EditableField;
  onClose: () => void;
};

const letterRows = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const symbolRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "¥", "&", "@", "\""],
  ["#+=", ".", ",", "?", "!", "'"],
];

function setNativeValue(field: EditableField, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (!valueSetter) return;

  valueSetter.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function DesktopVirtualKeyboard({
  activeField,
  onClose,
}: DesktopVirtualKeyboardProps) {
  const [showSymbols, setShowSymbols] = useState(false);
  const rows = showSymbols ? symbolRows : letterRows;

  const updateValue = (value: string, selectionStart: number, selectionEnd = selectionStart) => {
    setNativeValue(activeField, value);
    activeField.focus();
    activeField.setSelectionRange(selectionStart, selectionEnd);
  };

  const insertText = (text: string) => {
    const start = activeField.selectionStart ?? activeField.value.length;
    const end = activeField.selectionEnd ?? start;
    const nextValue =
      activeField.value.slice(0, start) + text + activeField.value.slice(end);
    const nextCursor = start + text.length;

    updateValue(nextValue, nextCursor);
  };

  const deleteBackward = () => {
    const start = activeField.selectionStart ?? activeField.value.length;
    const end = activeField.selectionEnd ?? start;

    if (start === 0 && start === end) return;

    const deleteStart = start === end ? start - 1 : start;
    const nextValue =
      activeField.value.slice(0, deleteStart) + activeField.value.slice(end);

    updateValue(nextValue, deleteStart);
  };

  const keepFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <section
      className="shrink-0 border-t border-black/[0.06] bg-[#d8dce4] px-1.5 pb-2 pt-1.5 text-[#14171a] [box-shadow:0_-8px_22px_rgba(15,23,42,0.12)]"
      aria-label="桌面端演示输入法"
    >
      <div className="mb-1.5 flex items-center gap-1 overflow-hidden px-1 text-[13px] leading-5">
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => insertText("我")}
          className="rounded-md px-2 py-0.5 font-medium text-primary transition hover:bg-white/70"
        >
          我
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => insertText("我们")}
          className="rounded-md px-2 py-0.5 transition hover:bg-white/70"
        >
          我们
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => insertText("今天")}
          className="rounded-md px-2 py-0.5 transition hover:bg-white/70"
        >
          今天
        </button>
        <span className="min-w-0 flex-1 truncate text-text-tertiary">拼音</span>
      </div>

      <div className="space-y-1">
        {rows.map((row, rowIndex) => (
          <div
            key={`${showSymbols ? "symbols" : "letters"}-${rowIndex}`}
            className="flex justify-center gap-1"
          >
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  if (key === "#+=") {
                    setShowSymbols(false);
                    return;
                  }
                  insertText(showSymbols ? key : key.toLowerCase());
                }}
                className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-[5px] bg-white text-[15px] font-medium shadow-[0_1px_1px_rgba(15,23,42,0.2)] transition hover:bg-white/80 active:scale-[0.96]"
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        <div className="flex gap-1">
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setShowSymbols((current) => !current)}
            className="h-8 w-[48px] rounded-[5px] bg-[#abb2bd] text-[13px] font-medium shadow-[0_1px_1px_rgba(15,23,42,0.18)] transition hover:bg-[#a0a8b4]"
          >
            {showSymbols ? "ABC" : "123"}
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => insertText(" ")}
            className="h-8 flex-1 rounded-[5px] bg-white text-[13px] shadow-[0_1px_1px_rgba(15,23,42,0.2)] transition hover:bg-white/80"
          >
            空格
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={deleteBackward}
            aria-label="退格"
            className="flex h-8 w-[48px] items-center justify-center rounded-[5px] bg-[#abb2bd] text-lg shadow-[0_1px_1px_rgba(15,23,42,0.18)] transition hover:bg-[#a0a8b4]"
          >
            ⌫
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={onClose}
            className="h-8 w-[52px] rounded-[5px] bg-white text-[13px] font-medium text-primary shadow-[0_1px_1px_rgba(15,23,42,0.2)] transition hover:bg-white/80"
          >
            完成
          </button>
        </div>
      </div>
    </section>
  );
}
