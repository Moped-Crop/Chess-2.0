import { describe, it, expect } from 'vitest';
import { serializeMatch, parseMatch } from '../src/app/persistence/storage';
import { createInitialState } from '../src/engine/setup';
import type { MoveEntry } from '../src/app/notation';
import type { Piece } from '../src/engine/types';

describe('match serialization (export/import)', () => {
  it('round-trips game, move log and captures', () => {
    const game = createInitialState();
    const moveLog: MoveEntry[] = [
      { color: 'white', pieceType: 'P', san: 'e2–e4' },
      { color: 'black', pieceType: 'N', san: 'b8–c6' },
    ];
    const captures: (Piece | null)[] = [
      null,
      { type: 'P', color: 'white', hasMoved: true, evolved: false },
    ];
    const parsed = parseMatch(serializeMatch(game, moveLog, captures));
    expect(parsed).not.toBeNull();
    expect(parsed!.moveLog).toEqual(moveLog);
    expect(parsed!.captures).toEqual(captures);
    expect(parsed!.game.board.length).toBe(80);
  });

  it('accepts a legacy bare GameState (position only)', () => {
    const game = createInitialState();
    const parsed = parseMatch(JSON.stringify(game));
    expect(parsed).not.toBeNull();
    expect(parsed!.moveLog).toEqual([]);
    expect(parsed!.captures).toEqual([]);
  });

  it('rejects garbage', () => {
    expect(parseMatch('not json')).toBeNull();
    expect(parseMatch('{"board":[1,2,3]}')).toBeNull();
    expect(parseMatch('42')).toBeNull();
  });
});
