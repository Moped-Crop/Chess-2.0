import { describe, it, expect } from 'vitest';
import { sq } from '../src/engine/board';
import { inEvoZone, evolutionFormsFor } from '../src/engine/evolution';
import { movesForPiece } from '../src/engine/moveGen';
import { evolvedMoves } from '../src/engine/pieces/evolved';
import { applyMove } from '../src/engine/apply';
import { legalMoves, isKingInCheck } from '../src/engine/legality';
import { emptyBoard, makePiece, makeState } from './helpers';

describe('evolution zone (B8)', () => {
  it('N/B/R zone is ranks 5-7 for white, 0-2 for black', () => {
    const wn = makePiece('N', 'white');
    expect(inEvoZone(sq(0, 5), wn)).toBe(true);
    expect(inEvoZone(sq(0, 4), wn)).toBe(false);
    const bn = makePiece('N', 'black');
    expect(inEvoZone(sq(0, 2), bn)).toBe(true);
    expect(inEvoZone(sq(0, 3), bn)).toBe(false);
  });

  it('ROO zone is narrower: ranks 6-7 for white', () => {
    const wr = makePiece('ROO', 'white');
    expect(inEvoZone(sq(0, 6), wr)).toBe(true);
    expect(inEvoZone(sq(0, 5), wr)).toBe(false);
  });

  it('lists the two forms for a knight, one for a rooster', () => {
    expect(evolutionFormsFor('N')).toEqual(['N_OUTRIDER', 'N_HUNTER']);
    expect(evolutionFormsFor('ROO')).toEqual(['ROO_PHOENIX']);
  });
});

describe('evolution move expansion (B4)', () => {
  it('a knight move into the zone splits into two form variants', () => {
    const board = emptyBoard();
    const knight = makePiece('N', 'white');
    board[sq(3, 3)] = knight; // d4
    const moves = movesForPiece(knight, sq(3, 3), board);
    const toE6 = moves.filter((m) => m.to === sq(4, 5)); // e6 is rank 5 -> in zone
    expect(toE6.map((m) => m.evolveTo).sort()).toEqual(['N_HUNTER', 'N_OUTRIDER']);
    const toB3 = moves.filter((m) => m.to === sq(1, 2)); // b3 rank 2 -> not in white zone
    expect(toB3).toHaveLength(1);
    expect(toB3[0].evolveTo).toBeUndefined();
  });

  it('a rooster move into rank 6/7 yields a single Phoenix variant', () => {
    const board = emptyBoard();
    const roo = makePiece('ROO', 'white');
    board[sq(4, 5)] = roo; // e6
    const moves = movesForPiece(roo, sq(4, 5), board);
    const toE7 = moves.filter((m) => m.to === sq(4, 6)); // e7 rank 6 -> ROO zone
    expect(toE7).toHaveLength(1);
    expect(toE7[0].evolveTo).toBe('ROO_PHOENIX');
  });

  it('an already-evolved piece does not re-evolve (A10)', () => {
    const board = emptyBoard();
    const hunter = makePiece('N_HUNTER', 'white', { evolved: true });
    board[sq(3, 5)] = hunter; // d6, inside the zone
    const moves = movesForPiece(hunter, sq(3, 5), board);
    expect(moves.every((m) => m.evolveTo === undefined)).toBe(true);
  });
});

describe('evolution application', () => {
  it('replaces the piece with the chosen form and resets the clock (B6)', () => {
    const board = emptyBoard();
    board[sq(3, 3)] = makePiece('N', 'white'); // d4
    board[sq(0, 0)] = makePiece('K', 'white');
    board[sq(9, 7)] = makePiece('K', 'black');
    const state = makeState(board, 'white', { halfmoveClock: 7 });
    const move = movesForPiece(state.board[sq(3, 3)]!, sq(3, 3), board).find(
      (m) => m.to === sq(4, 5) && m.evolveTo === 'N_HUNTER',
    )!;
    const next = applyMove(state, move);
    expect(next.board[sq(4, 5)]).toMatchObject({ type: 'N_HUNTER', evolved: true });
    expect(next.halfmoveClock).toBe(0);
  });

  it('an evolving move may give check (B1 — no special restriction)', () => {
    const board = emptyBoard();
    board[sq(7, 6)] = makePiece('R', 'white'); // h7, will slide along rank 6 into the zone
    board[sq(0, 7)] = makePiece('K', 'black'); // a8
    board[sq(7, 0)] = makePiece('K', 'white'); // h1, safe
    const state = makeState(board, 'white');
    const move = legalMoves(state).find(
      (m) => m.from === sq(7, 6) && m.to === sq(0, 6) && m.evolveTo,
    );
    expect(move).toBeTruthy(); // the evolving move is legal even though it checks
    const next = applyMove(state, move!);
    expect(isKingInCheck(next.board, 'black')).toBe(true);
  });
});

describe('form movement specifics (B2)', () => {
  it('Phoenix can step backward but only captures forward', () => {
    const board = emptyBoard();
    board[sq(4, 3)] = makePiece('ROO_PHOENIX', 'white', { evolved: true }); // e4
    board[sq(4, 4)] = makePiece('P', 'black'); // e5 forward (capture)
    board[sq(3, 4)] = makePiece('N', 'black'); // d5 forward-diагональ (capture)
    const moves = evolvedMoves(board[sq(4, 3)]!, sq(4, 3), board);
    expect(moves.some((m) => m.to === sq(4, 2) && m.capture === undefined)).toBe(true); // e3 step back
    expect(moves.some((m) => m.to === sq(4, 4) && m.capture === sq(4, 4))).toBe(true); // capture e5
    expect(moves.some((m) => m.to === sq(3, 4) && m.capture === sq(3, 4))).toBe(true); // capture d5
  });

  it('Anchor moves diagonally only onto empty squares (Ferz move-only)', () => {
    const empty = emptyBoard();
    const anchor = makePiece('R_ANCHOR', 'white', { evolved: true });
    empty[sq(4, 3)] = anchor; // e4
    expect(evolvedMoves(anchor, sq(4, 3), empty).some((m) => m.to === sq(3, 4))).toBe(true); // d5 empty -> move

    const blocked = emptyBoard();
    blocked[sq(4, 3)] = anchor;
    blocked[sq(3, 4)] = makePiece('P', 'black'); // enemy on the diagonal
    const moves = evolvedMoves(anchor, sq(4, 3), blocked);
    expect(moves.some((m) => m.to === sq(3, 4))).toBe(false); // no move and no capture diagonally
  });
});
