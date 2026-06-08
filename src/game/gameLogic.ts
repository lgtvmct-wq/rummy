import { GameState } from '../types';

export function getExitLimitFor(g?: Partial<GameState> | null): number {
  if (!g) return 241;
  return g.exitScoreLimit !== undefined ? Number(g.exitScoreLimit) : 241;
}

export function getMaxReEntriesFor(g?: Partial<GameState> | null): number {
  if (!g) return 1;
  return g.maxReEntries !== undefined ? Number(g.maxReEntries) : 1;
}

export function getPlayerReEntriesCount(p: string, g?: Partial<GameState> | null): number {
  if (!g || !g.reEntries) return 0;
  const val = g.reEntries[p];
  if (typeof val === 'number') return val;
  if (val === true) return 1;
  return 0;
}

export function isPlayerExceededLimit(p: string, g?: Partial<GameState> | null): boolean {
  if (!g) return false;
  const score = g.totals?.[p] ?? 0;
  const limit = getExitLimitFor(g);
  if (g.ruleset === 'standard' || g.ruleset === 'tournament') {
    return score > 241;
  }
  return score >= limit;
}

export function canPlayerReEnter(p: string, g?: Partial<GameState> | null): boolean {
  if (!g) return false;
  if (g.ruleset === 'tournament') return false;
  const currentCount = getPlayerReEntriesCount(p, g);
  const maxVal = getMaxReEntriesFor(g);
  return currentCount < maxVal;
}

export function getDealerForState(g?: Partial<GameState> | null): string | null {
  if (!g || g.winner) return null;
  
  // Combine startingPlayers and any other players to ensure everyone is represented in order
  const roster: string[] = [];
  const seen = new Set<string>();
  if (g.startingPlayers) {
    g.startingPlayers.forEach(p => {
      if (!seen.has(p)) {
        seen.add(p);
        roster.push(p);
      }
    });
  }
  if (g.players) {
    g.players.forEach(p => {
      if (!seen.has(p)) {
        seen.add(p);
        roster.push(p);
      }
    });
  }
  if (roster.length === 0) return null;

  // Active players in the current round
  const activeInRound = (g.players || []).filter(p => !g.eliminated?.[p] && !isPlayerExceededLimit(p, g));
  if (activeInRound.length === 0) return null;

  // If we are at Round 1, the dealer is roster[0]
  if (!g.history || g.history.length === 0) {
    return roster[0];
  }

  // Find who dealt the last round
  let lastDealer: string | null = null;
  const lastHistoryEntry = g.history[g.history.length - 1];
  if (lastHistoryEntry && lastHistoryEntry.dealer) {
    lastDealer = lastHistoryEntry.dealer;
  }

  // If no last dealer is saved (legacy games/refresh), reconstruct sequentially
  if (!lastDealer) {
    let simulatedDealer = roster[0];
    for (let i = 0; i < g.history.length; i++) {
      const hEntry = g.history[i];
      hEntry.dealer = simulatedDealer; // save/cache it
      
      // Compute the next dealer for the next round
      const dIdx = roster.indexOf(simulatedDealer);
      const startSearchIdx = dIdx !== -1 ? dIdx : 0;
      
      // For history round i+2, find the next active player for the next round
      let foundNext = false;
      for (let offset = 1; offset <= roster.length; offset++) {
        const checkIdx = (startSearchIdx + offset) % roster.length;
        const candidate = roster[checkIdx];
        
        // If this is the last history round, the next round is the current active round g
        const isLastHistory = (i === g.history.length - 1);
        if (isLastHistory) {
          if (!g.eliminated?.[candidate] && !isPlayerExceededLimit(candidate, g) && g.players?.includes(candidate)) {
            simulatedDealer = candidate;
            foundNext = true;
            break;
          }
        } else {
          // For intermediate history round, check if player was active in that next round
          const nextHEntry = g.history[i + 1];
          const isActiveInNext = nextHEntry && nextHEntry.players && nextHEntry.players.includes(candidate);
          if (isActiveInNext) {
            simulatedDealer = candidate;
            foundNext = true;
            break;
          }
        }
      }
      if (!foundNext) {
        simulatedDealer = roster[(i + 1) % roster.length];
      }
    }
    lastDealer = g.history[g.history.length - 1]?.dealer || roster[0];
  }

  // Use the explicitly found lastDealer to determine the current dealer
  const lastDealerIdx = roster.indexOf(lastDealer);
  const startSearchIdx = lastDealerIdx !== -1 ? lastDealerIdx : 0;

  for (let offset = 1; offset <= roster.length; offset++) {
    const checkIdx = (startSearchIdx + offset) % roster.length;
    const candidate = roster[checkIdx];
    if (!g.eliminated?.[candidate] && !isPlayerExceededLimit(candidate, g) && g.players?.includes(candidate)) {
      return candidate;
    }
  }

  return roster[0];
}

export function formatEliteDate(dateObj: any): string {
  if (!dateObj) return '-';
  let d: Date;
  if (dateObj instanceof Date) {
    d = dateObj;
  } else if (typeof dateObj === 'object' && dateObj.toDate) {
    // Handle Firestore Timestamp
    d = dateObj.toDate();
  } else {
    d = new Date(dateObj);
    if (isNaN(d.getTime())) return String(dateObj); 
  }
  
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${dd}-${mm}-${yy} ${hours}:${minutes} ${ampm}`;
}

export function getFirstName(name: string): string {
  if (!name) return "";
  return name.split(' ')[0];
}
