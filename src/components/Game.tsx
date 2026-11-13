"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bestMove,
  blankBoard,
  emptyBook,
  other,
  outcome,
  randomMove,
  sanitizeBook,
  STORAGE_KEY,
  tally,
  untally,
  type Cell,
  type Mark,
  type Mode,
  type Scorebook,
} from "@/lib/game";

type Snapshot = { board: Cell[]; turn: Mark };

function MarkGlyph({ mark }: { mark: Mark }) {
  if (mark === "X") {
    return (
      <svg viewBox="0 0 100 100" className="h-[42%] w-[42%]" aria-hidden>
        <path
          d="M28 28 L72 72 M72 28 L28 72"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" className="h-[42%] w-[42%]" aria-hidden>
      <circle
        cx="50"
        cy="50"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
      />
    </svg>
  );
}

function WinStrike({
  line,
  mark,
}: {
  line: readonly number[];
  mark: Mark;
}) {
  const [start, , end] = line;
  const point = (index: number) => ({
    x: (index % 3) + 0.5,
    y: Math.floor(index / 3) + 0.5,
  });
  const from = point(start ?? 0);
  const to = point(end ?? 0);
  return (
    <svg
      viewBox="0 0 3 3"
      className={`pointer-events-none absolute inset-0 h-full w-full ${
        mark === "X" ? "text-mark-x" : "text-mark-o"
      }`}
      aria-hidden
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        pathLength={1}
        stroke="currentColor"
        strokeWidth={0.085}
        strokeLinecap="round"
        className="win-line"
      />
    </svg>
  );
}

export default function Game() {
  const [mode, setMode] = useState<Mode>("local");
  const [difficulty, setDifficulty] = useState<"easy" | "hard">("hard");
  const [board, setBoard] = useState<Cell[]>(blankBoard);
  const [turn, setTurn] = useState<Mark>("X");
  const [roundStart, setRoundStart] = useState<Mark>("X");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [scores, setScores] = useState<Scorebook>(emptyBook);
  const [ready, setReady] = useState(false);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  const modeRef = useRef(mode);
  const completed = useRef(false);
  boardRef.current = board;
  turnRef.current = turn;
  modeRef.current = mode;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setScores(sanitizeBook(JSON.parse(raw) as unknown));
    } catch {
      // Ignore unreadable saves and start from zero.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  }, [ready, scores]);

  const result = outcome(board);
  const thinking = mode === "cpu" && turn === "O" && !result;

  const place = useCallback((index: number, player: Mark) => {
    const current = boardRef.current;
    if (player !== turnRef.current) return;
    if (current[index] || outcome(current)) return;
    const next = current.slice();
    next[index] = player;
    const nextTurn = other(player);
    boardRef.current = next;
    turnRef.current = nextTurn;
    setBoard(next);
    setHistory((snapshots) => [...snapshots, { board: current, turn: player }]);
    setTurn(nextTurn);
    const nextResult = outcome(next);
    if (nextResult) {
      completed.current = true;
      setScores((book) => ({
        ...book,
        [mode]: tally(book[mode], nextResult),
      }));
    }
  }, [mode]);

  const placeRef = useRef(place);
  placeRef.current = place;

  function playHuman(index: number) {
    if (mode === "cpu" && turnRef.current !== "X") return;
    place(index, turnRef.current);
  }

  useEffect(() => {
    if (mode !== "cpu" || turn !== "O" || outcome(boardRef.current)) return;
    const id = window.setTimeout(() => {
      const snapshot = boardRef.current;
      if (outcome(snapshot)) return;
      const index =
        difficulty === "hard" ? bestMove(snapshot, "O") : randomMove(snapshot);
      if (index < 0) return;
      place(index, "O");
    }, 420);
    return () => window.clearTimeout(id);
  }, [mode, turn, board, difficulty, place]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const square = Number(event.key);
      if (!Number.isInteger(square) || square < 1 || square > 9) return;
      event.preventDefault();
      if (modeRef.current === "cpu" && turnRef.current !== "X") return;
      placeRef.current(square - 1, turnRef.current);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function resetBoard(nextTurn: Mark) {
    const empty = blankBoard();
    boardRef.current = empty;
    turnRef.current = nextTurn;
    setBoard(empty);
    setTurn(nextTurn);
    setHistory([]);
  }

  function changeMode(next: Mode) {
    if (next === mode) return;
    completed.current = false;
    setMode(next);
    setRoundStart("X");
    resetBoard("X");
  }

  function newRound() {
    const next = completed.current ? other(roundStart) : roundStart;
    completed.current = false;
    setRoundStart(next);
    resetBoard(next);
  }

  function undo() {
    if (history.length === 0) return;
    const finished = outcome(boardRef.current);
    let snapshots = history;
    let restored = snapshots[snapshots.length - 1];
    if (!restored) return;
    snapshots = snapshots.slice(0, -1);

    if (mode === "cpu") {
      while (restored.turn !== "X" && snapshots.length > 0) {
        const previous = snapshots[snapshots.length - 1];
        if (!previous) break;
        restored = previous;
        snapshots = snapshots.slice(0, -1);
      }
      if (restored.turn !== "X") return;
    }

    boardRef.current = restored.board;
    turnRef.current = restored.turn;
    setBoard(restored.board);
    setTurn(restored.turn);
    setHistory(snapshots);
    if (finished) {
      completed.current = false;
      setScores((book) => ({
        ...book,
        [mode]: untally(book[mode], finished),
      }));
    }
  }

  const canUndo =
    history.length > 0 &&
    (mode === "local" || history.some((snapshot) => snapshot.turn === "X"));

  const score = scores[mode];
  const status = statusText(mode, turn, result, thinking);

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,74,50,0.18),transparent_52%),radial-gradient(ellipse_at_bottom,rgba(15,110,115,0.2),transparent_48%)]" />
      <main className="relative mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <p className="text-[11px] font-medium tracking-[0.32em] text-foreground/45 uppercase">
            Three in a row
          </p>
          <h1 className="font-display mt-2 text-5xl tracking-tight text-foreground sm:text-6xl">
            Tic Tac Toe
          </h1>
        </header>

        <div className="mb-6 flex rounded-full bg-white/6 p-1">
          {(
            [
              ["local", "Pass & play"],
              ["cpu", "Vs computer"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => changeMode(value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                mode === value
                  ? "bg-paper text-ink"
                  : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "cpu" && (
          <div className="mb-6 flex items-center gap-2">
            <span className="text-xs tracking-wide text-foreground/45 uppercase">
              You are X
            </span>
            <div className="flex rounded-full bg-white/6 p-1">
              {(
                [
                  ["easy", "Easy"],
                  ["hard", "Hard"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={difficulty === value}
                  onClick={() => setDifficulty(value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    difficulty === value
                      ? "bg-paper text-ink"
                      : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <section
          className="mb-6 grid w-full grid-cols-3 gap-2"
          aria-label="Score"
        >
          <ScoreCard
            label={mode === "cpu" ? "You" : "X"}
            mark="X"
            value={ready ? score.x : 0}
            active={!result && turn === "X"}
          />
          <ScoreCard
            label="Draws"
            value={ready ? score.draws : 0}
            active={false}
          />
          <ScoreCard
            label={mode === "cpu" ? "CPU" : "O"}
            mark="O"
            value={ready ? score.o : 0}
            active={!result && turn === "O"}
          />
        </section>

        <div className="w-full max-w-[420px]">
          <div
            data-board
            className="relative aspect-square overflow-hidden rounded-[28px] bg-paper shadow-[0_28px_70px_-28px_rgba(0,0,0,0.85)]"
          >
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {board.map((cell, index) => {
                const winning =
                  result?.kind === "win" && result.line.includes(index);
                const locked = Boolean(cell) || Boolean(result) || thinking;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={locked}
                    aria-label={cellLabel(index, cell)}
                    onClick={() => playHuman(index)}
                    className={`group relative flex items-center justify-center transition disabled:cursor-default ${
                      winning ? "bg-[#f4dd9a]" : "hover:bg-ink/4 enabled:cursor-pointer"
                    } focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-ink/50`}
                  >
                    {cell ? (
                      <span
                        className={`mark-in ${
                          cell === "X" ? "text-mark-x" : "text-mark-o"
                        }`}
                      >
                        <MarkGlyph mark={cell} />
                      </span>
                    ) : (
                      !locked && (
                        <span className="text-ink/15 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                          <MarkGlyph mark={turn} />
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-[7%]" aria-hidden>
              <span className="absolute top-0 left-1/3 h-full w-px bg-ink/18" />
              <span className="absolute top-0 left-2/3 h-full w-px bg-ink/18" />
              <span className="absolute top-1/3 left-0 h-px w-full bg-ink/18" />
              <span className="absolute top-2/3 left-0 h-px w-full bg-ink/18" />
            </div>
            {result?.kind === "win" && (
              <WinStrike line={result.line} mark={result.mark} />
            )}
          </div>
        </div>

        <p
          className="font-display mt-6 min-h-8 text-center text-2xl text-foreground"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={newRound}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            New round
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() =>
              setScores((book) => ({ ...book, [mode]: { x: 0, o: 0, draws: 0 } }))
            }
            className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition hover:bg-white/8"
          >
            Reset scores
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-foreground/40">
          {mode === "cpu"
            ? difficulty === "hard"
              ? "Hard never loses. Keys 1–9 fill the board from the top left."
              : "Easy picks a random empty square. Keys 1–9 fill the board from the top left."
            : "Same keyboard, same board. Keys 1–9 fill from the top left. Scores stay on this device."}
        </p>
      </main>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  active,
  mark,
}: {
  label: string;
  value: number;
  active: boolean;
  mark?: Mark;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 text-center transition ${
        active
          ? "border-foreground/30 bg-white/8"
          : "border-white/8 bg-white/4"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 text-[11px] tracking-[0.16em] text-foreground/50 uppercase">
        {mark && (
          <span className={mark === "X" ? "text-mark-x" : "text-mark-o"}>
            {mark}
          </span>
        )}
        {label}
      </div>
      <div className="font-display mt-1 text-3xl tabular-nums">{value}</div>
    </div>
  );
}

function cellLabel(index: number, cell: Cell) {
  const row = Math.floor(index / 3) + 1;
  const column = (index % 3) + 1;
  return `Row ${row}, column ${column}${cell ? `, ${cell}` : ", empty"}`;
}

function statusText(
  mode: Mode,
  turn: Mark,
  result: ReturnType<typeof outcome>,
  thinking: boolean,
) {
  if (result?.kind === "draw") return "Draw";
  if (result?.kind === "win") {
    if (mode === "cpu") return result.mark === "X" ? "You win" : "Computer wins";
    return `${result.mark} wins`;
  }
  if (thinking) return "Computer is thinking";
  if (mode === "cpu") return "Your move";
  return `${turn} to move`;
}
