/**
 * Публичный API игрового ядра. UI (app/) импортирует движок только отсюда.
 * Ядро engine/ НИКОГДА не импортирует ничего из app/, React или DOM.
 */

export * from './types';
export * from './board';
export { attacksFrom, isSquareAttackedBy } from './attacks';
export { generatePseudoLegal, movesForPiece } from './moveGen';
export { applyMove } from './apply';
export { legalMoves, isKingInCheck, findKing } from './legality';
export { createInitialState } from './setup';
export { positionKey } from './hash';
export {
  computeResult,
  isCheckmate,
  isStalemate,
  isThreefoldRepetition,
  isSeventyFiveMoveRule,
  isInsufficientMaterial,
} from './terminal';
export { generateCastling, generateEnPassant, generateSpecialMoves } from './special';
export { inEvoZone, isWorking, evolutionFormsFor, expandEvolution } from './evolution';
