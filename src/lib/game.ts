export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Mode = "local" | "cpu";

export type Outcome =
  | { kind: "win"; mark: Mark; line: readonly number[] }
  | { kind: "draw" };

export type Scores = { x: number; o: number; draws: number };
export type Scorebook = Record<Mode, Scores>;

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const OPENING_PREFERENCE = [4, 0, 2, 6, 8, 1, 3, 5, 7];

export const STORAGE_KEY = "cmhk-ttt-v1";

export function blankBoard(): Cell[] {
  return Array.from({ length: 9 }, () => null);
}

export function emptyScores(): Scores {
  return { x: 0, o: 0, draws: 0 };
}

export function emptyBook(): Scorebook {
  return { local: emptyScores(), cpu: emptyScores() };
}

export function other(mark: Mark): Mark {
  return mark === "X" ? "O" : "X";
}

export function outcome(board: readonly Cell[]): Outcome | null {
  for (const line of LINES) {
    const mark = board[line[0]];
    if (mark && mark === board[line[1]] && mark === board[line[2]]) {
      return { kind: "win", mark, line };
    }
  }
  if (board.every(Boolean)) return { kind: "draw" };
  return null;
}

export function tally(scores: Scores, result: Outcome): Scores {
  if (result.kind === "draw") return { ...scores, draws: scores.draws + 1 };
  if (result.mark === "X") return { ...scores, x: scores.x + 1 };
  return { ...scores, o: scores.o + 1 };
}

export function untally(scores: Scores, result: Outcome): Scores {
  if (result.kind === "draw") {
    return { ...scores, draws: Math.max(0, scores.draws - 1) };
  }
  if (result.mark === "X") return { ...scores, x: Math.max(0, scores.x - 1) };
  return { ...scores, o: Math.max(0, scores.o - 1) };
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function sanitizeBook(value: unknown): Scorebook {
  const book = emptyBook();
  if (!value || typeof value !== "object") return book;
  const record = value as Record<string, unknown>;
  for (const mode of ["local", "cpu"] as const) {
    const row = record[mode];
    if (!row || typeof row !== "object") continue;
    const scores = row as Record<string, unknown>;
    book[mode] = {
      x: asCount(scores.x),
      o: asCount(scores.o),
      draws: asCount(scores.draws),
    };
  }
  return book;
}

function openSquares(board: readonly Cell[]): number[] {
  const open: number[] = [];
  board.forEach((cell, index) => {
    if (!cell) open.push(index);
  });
  return open;
}

export function randomMove(board: readonly Cell[]): number {
  const open = openSquares(board);
  if (open.length === 0) return -1;
  return open[Math.floor(Math.random() * open.length)] ?? -1;
}

function terminalScore(board: Cell[], depth: number): number | null {
  const result = outcome(board);
  if (result?.kind === "win") {
    return result.mark === "X" ? 10 - depth : depth - 10;
  }
  if (result?.kind === "draw") return 0;
  return null;
}

function minimax(board: Cell[], player: Mark, depth: number): number {
  const terminal = terminalScore(board, depth);
  if (terminal !== null) return terminal;

  let best = player === "X" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const index of openSquares(board)) {
    board[index] = player;
    const score = minimax(board, other(player), depth + 1);
    board[index] = null;
    best = player === "X" ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

export function bestMove(board: readonly Cell[], player: Mark = "O"): number {
  const snapshot = board.slice();
  const open = openSquares(snapshot);
  if (open.length === 0) return -1;

  let bestScore = player === "O" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  let choices: number[] = [];

  for (const index of open) {
    snapshot[index] = player;
    const score = minimax(snapshot, other(player), 1);
    snapshot[index] = null;
    const better = player === "O" ? score < bestScore : score > bestScore;
    if (better) {
      bestScore = score;
      choices = [index];
    } else if (score === bestScore) {
      choices.push(index);
    }
  }

  return OPENING_PREFERENCE.find((index) => choices.includes(index)) ?? choices[0] ?? -1;
}
