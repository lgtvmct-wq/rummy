export interface Player {
  id: string;
  fullName: string;
  isOnline: boolean;
  photoURL: string;
  createdAt?: any;
}

export interface ActionStats {
  shows: number;
  fcs: number;
  drops: number;
  mds: number;
}

export interface GameHistoryEntry {
  round: number;
  players: string[];
  scores: Record<string, number | 'S' | 'OUT' | null>;
  tactics: Record<string, string | null>;
  totals: Record<string, number>;
  reentries: Record<string, number>;
  bustedTotals: Record<string, number>;
  dealer?: string | null;
}

export type RoundEntry = GameHistoryEntry;

export interface GameState {
  id: string;
  name: string;
  players: string[]; // Active players in current round
  startingPlayers: string[]; // Absolute starting order
  totals: Record<string, number>;
  roundScores: Record<string, number | 'S' | 'OUT' | null>;
  roundTactics: Record<string, string | null>;
  lastDropRound: Record<string, number>;
  actionStats: Record<string, ActionStats>;
  eliminated: Record<string, boolean>;
  reEntries: Record<string, number | boolean>;
  exitScoreLimit: number;
  maxReEntries: number;
  isAborted?: boolean;
  isDeleted?: boolean;
  round: number;
  startTime: string;
  endTime?: string | null;
  winner?: string | null;
  history: GameHistoryEntry[];
  creatorId?: string;
  creatorName?: string;
  ruleset?: 'standard' | 'custom' | 'tournament';
  admin?: string;
  midGamePlayerEntries?: Record<string, number>;
  lastActivity?: number;
  seatCutOutcome?: {
    shuffledPlayers: string[];
    dealer: string;
    seatingOrder: { seat: number; player: string; card: string; rank: number }[];
    distributionOrder: string[];
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
