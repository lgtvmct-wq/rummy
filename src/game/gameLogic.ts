import { GameState } from '../types';

export function getExitLimitFor(g?: Partial<GameState> | null): number {
  if (!g) return 240;
  return g.exitScoreLimit !== undefined ? Number(g.exitScoreLimit) : 240;
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

export function canPlayerReEnter(p: string, g?: Partial<GameState> | null): boolean {
  if (!g) return false;
  const currentCount = getPlayerReEntriesCount(p, g);
  const maxVal = getMaxReEntriesFor(g);
  return currentCount < maxVal;
}

export function getDealerForState(g?: Partial<GameState> | null): string | null {
  if (!g || g.winner) return null;
  
  const exitLimit = getExitLimitFor(g);
  const activeInRound = (g.players || []).filter(p => !g.eliminated?.[p] && (g.totals?.[p] || 0) < exitLimit);
  if (activeInRound.length === 0) return null;
  
  const roster = g.startingPlayers || g.players || [];
  if (roster.length === 0) return null;
  
  const dIdx = (g.round - 1) % roster.length;
  let dealer = roster[dIdx];
  
  // Rule: If a player Y is slated to deal this round (g.round), and they exited in the playing round (g.round - 1) and reentered,
  // the deal must go back to them. We force them as dealer, bypassing standard skip/repeat dealer logic.
  let forceReenteredDealer = false;
  if (g.round > 1 && g.history) {
    const lastRound = g.round - 1;
    const lastEntry = g.history.find(h => h.round === lastRound);
    if (lastEntry) {
      const scoreInLastRound = lastEntry.scores?.[dealer];
      const wasBusted = (lastEntry.bustedTotals && lastEntry.bustedTotals[dealer] !== undefined) || (scoreInLastRound === 'OUT');
      const hasReentered = (lastEntry.reentries && lastEntry.reentries[dealer] !== undefined) || 
                           (!g.eliminated?.[dealer] && (g.totals?.[dealer] || 0) < exitLimit);
      
      if (wasBusted && hasReentered) {
        forceReenteredDealer = true;
      }
    }
  }
  
  if (forceReenteredDealer && g.eliminated && !g.eliminated[dealer] && (g.totals?.[dealer] || 0) < exitLimit) {
    return dealer;
  }
  
  // Standard rotation: If dealer is OUT, the previous active player repeats.
  if (g.eliminated?.[dealer] || (g.totals?.[dealer] || 0) >= exitLimit) {
    for (let i = 1; i <= roster.length; i++) {
      const prevIdx = (dIdx - i + roster.length) % roster.length;
      const prevP = roster[prevIdx];
      if (!g.eliminated?.[prevP] && (g.totals?.[prevP] || 0) < exitLimit && g.players.includes(prevP)) {
        dealer = prevP;
        break;
      }
    }
  }
  
  return dealer;
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
