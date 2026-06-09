import React, { useState, useEffect, useRef } from 'react';
import { GameState, Player, RoundEntry } from '../types';
import { auth, db } from '../services/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { 
  getExitLimitFor, 
  getMaxReEntriesFor, 
  getPlayerReEntriesCount, 
  canPlayerReEnter, 
  getDealerForState, 
  formatEliteDate,
  isPlayerExceededLimit
} from '../game/gameLogic';
import { Scoreboard } from '../components/Scoreboard';
import { SeatCutModal } from '../components/SeatCutModal';

interface ActiveGameProps {
  gameState: GameState | null;
  playersDb: Player[];
  onExit: () => void;
}

export const ActiveGame: React.FC<ActiveGameProps> = ({ gameState, playersDb, onExit }) => {
  const [state, setState] = useState<GameState | null>(gameState);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  
  // Mid game modal
  const [isMidGameOpen, setIsMidGameOpen] = useState(false);
  const [selectedMidPlayer, setSelectedMidPlayer] = useState('');

  // Seat Cut protocols
  const [isSeatCutOpen, setIsSeatCutOpen] = useState(false);

  // Edit Round modal
  const [isEditRoundOpen, setIsEditRoundOpen] = useState(false);
  const [editRoundNum, setEditRoundNum] = useState<number | null>(null);
  const [editRoundData, setEditRoundData] = useState<{ [player: string]: { score: string; tactic: string } }>({});

  // TV overlay
  const [isTVOpen, setIsTVOpen] = useState(false);
  const [showSeatCutAuditLog, setShowSeatCutAuditLog] = useState(false);

  // Re-entry modal queue
  const [reEntryQueue, setReEntryQueue] = useState<{ player: string; score: number }[]>([]);
  const [activeReEntry, setActiveReEntry] = useState<{ player: string; score: number } | null>(null);
  const [pendingEntry, setPendingEntry] = useState<RoundEntry | null>(null);
  const [pendingParticipants, setPendingParticipants] = useState<string[]>([]);

  // Update local state when prop changes (e.g., synchronized from Firestore heartbeat)
  useEffect(() => {
    if (gameState) {
      setState(gameState);
      setNewName(gameState.name);
    }
  }, [gameState]);

  // Keep Firestore active heartbeat
  useEffect(() => {
    if (!state?.id) return;
    const interval = setInterval(async () => {
      try {
        const docRef = doc(db, 'eliteGames', state.id);
        await updateDoc(docRef, { lastActivity: Date.now() });
      } catch (err) {
        console.error('Heartbeat update failed:', err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [state?.id]);

  if (!state) return null;

  const exitLimit = getExitLimitFor(state);
  const isGameOver = !!state.winner;
  const dealer = getDealerForState(state);

  const isAdmin = () => {
    if (!state.admin) return true; // Retroactive support
    if (!auth.currentUser) return false;
    const currentUserProfile = playersDb.find(p => p.id === auth.currentUser?.uid);
    if (!currentUserProfile) return false;
    return currentUserProfile.fullName === state.admin;
  };

  const saveGameNameInline = async () => {
    if (!isAdmin()) {
      alert("Only the game admin can rename this game.");
      setIsEditingName(false);
      return;
    }
    const base = newName.trim() || 'Game';
    const datePatternRegex = /\s+\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s+(?:AM|PM)$/i;
    let fallbackDate = state.startTime || formatEliteDate(new Date());
    const matchedDate = state.name.match(datePatternRegex);
    const dateStr = matchedDate ? matchedDate[0].trim() : fallbackDate;
    
    const finalName = `${base.replace(datePatternRegex, '')} ${dateStr}`;
    
    try {
      const docRef = doc(db, 'eliteGames', state.id);
      const updated = { ...state, name: finalName };
      await setDoc(docRef, updated);
      setState(updated);
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to change game name:', err);
      alert('Error updating game name.');
    }
  };

  // Keyboard and Tactical button handler
  const setTactic = async (player: string, type: 'S' | 'D' | 'MD' | 'FC' | 'FS') => {
    if (isGameOver || state.eliminated?.[player]) return;
    
    const updatedScores = { ...(state.roundScores || {}) };
    const updatedTactics = { ...(state.roundTactics || {}) };

    let v: any = null;
    let tactic: string | null = type;

    // Toggle off if the exact same tactic is already chosen
    const isCurrently = updatedTactics[player] === type;

    if (isCurrently) {
      v = null;
      tactic = null;
    } else {
      if (type === 'S') {
        // Clear other S
        state.players?.forEach(pl => {
          if (updatedScores[pl] === 'S' || updatedTactics[pl] === 'S') {
            updatedScores[pl] = null;
            updatedTactics[pl] = null;
          }
        });
        v = 'S';
        tactic = 'S';
      } 
      else if (type === 'D') {
        v = 20;
        tactic = 'D';
      } 
      else if (type === 'MD') {
        v = 40;
        tactic = 'MD';
      } 
      else if (type === 'FC') {
        v = 80;
        tactic = 'FC';
      } 
      else if (type === 'FS') {
        v = 0;
        tactic = 'FS';
      }
    }

    updatedScores[player] = v;
    updatedTactics[player] = tactic;

    try {
      const docRef = doc(db, 'eliteGames', state.id);
      await updateDoc(docRef, {
        roundScores: updatedScores,
        roundTactics: updatedTactics
      });
      setState(prev => prev ? { ...prev, roundScores: updatedScores, roundTactics: updatedTactics } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const markOut = async (player: string) => {
    if (isGameOver) return;
    const updatedScores = { ...(state.roundScores || {}) };
    const updatedTactics = { ...(state.roundTactics || {}) };

    updatedScores[player] = 'OUT';
    updatedTactics[player] = 'OUT';

    try {
      const docRef = doc(db, 'eliteGames', state.id);
      await updateDoc(docRef, {
        roundScores: updatedScores,
        roundTactics: updatedTactics
      });
      setState(prev => prev ? { ...prev, roundScores: updatedScores, roundTactics: updatedTactics } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const manualInput = async (player: string, val: string) => {
    let raw = val.trim();
    let v: any = null;
    const updatedScores = { ...(state.roundScores || {}) };
    const updatedTactics = { ...(state.roundTactics || {}) };

    if (raw !== '') {
      let up = raw.toUpperCase();
      if (up === 'S') {
        v = 'S';
      } else if (up === 'OUT') {
        markOut(player);
        return;
      } else {
        v = parseInt(raw);
      }

      if (v === 'S') {
        state.players?.forEach(pl => {
          if (pl !== player && updatedScores[pl] === 'S') {
            updatedScores[pl] = null;
            updatedTactics[pl] = null;
          }
        });
      }
      if (v !== 'S' && isNaN(v)) v = null;
    }

    updatedScores[player] = v;
    
    // STRICT USER INTENT REQUIREMENT (Outstanding Request 2):
    // Clear tactic highlight on manual input except for 'S'. 
    // This removes automations that trigger D or MD on entering 20 or 40 via keypad/keyboard.
    updatedTactics[player] = (v === 'S') ? 'S' : null;

    try {
      const docRef = doc(db, 'eliteGames', state.id);
      await updateDoc(docRef, {
        roundScores: updatedScores,
        roundTactics: updatedTactics
      });
      setState(prev => prev ? { ...prev, roundScores: updatedScores, roundTactics: updatedTactics } : null);
    } catch (e) {
      console.error(e);
    }
  };

  // Next round transitions and Authorized sequential Re-entry modal queue handling
  const triggerNextRound = async () => {
    if (!state || isGameOver) return;

    // Check if score is missing
    for (let p of (state.players || [])) {
      const sc = state.roundScores?.[p];
      const isNotOut = !state.eliminated?.[p] && !isPlayerExceededLimit(p, state);
      if (isNotOut && (sc === undefined || sc === null || sc === '')) {
        alert(`Score is missing for ${p}. Please select standard tactics, enter a score, or mark OUT.`);
        return;
      }
    }

    const scores = { ...(state.roundScores || {}) };
    const tactics = { ...(state.roundTactics || {}) };
    const allParticipants = Array.from(new Set([...(state.players || []), ...Object.keys(scores)]));

    const entry: RoundEntry = {
      round: state.round,
      players: allParticipants,
      scores: scores,
      tactics: tactics,
      totals: {},
      reentries: {},
      bustedTotals: {}
    };

    // 1. Evaluate totals
    const nextTotals = { ...(state.totals || {}) };
    const nextEliminated = { ...(state.eliminated || {}) };

    allParticipants.forEach(p => {
      const isOutThisRound = (scores[p] === 'OUT');
      if (!nextEliminated[p] || isOutThisRound) {
        let val = scores[p];
        let n = 0;
        if (val === 'S') n = 0;
        else if (val === 'OUT') {
          nextTotals[p] = exitLimit;
          nextEliminated[p] = true;
          n = 0;
        } else {
          n = Number(val) || 0;
        }

        if (!isOutThisRound) {
          nextTotals[p] = (nextTotals[p] || 0) + n;
          if (isPlayerExceededLimit(p, { ...state, totals: nextTotals })) {
            entry.bustedTotals[p] = nextTotals[p];
          }
        }

        // Apply visual action metrics
        const tactic = tactics[p];
        if (tactic === 'S' && state.actionStats?.[p]) state.actionStats[p].shows = (state.actionStats[p].shows || 0) + 1;
        if (tactic === 'D') {
          if (state.actionStats?.[p]) state.actionStats[p].drops = (state.actionStats[p].drops || 0) + 1;
          if (state.lastDropRound) state.lastDropRound[p] = state.round;
        }
        if (tactic === 'MD' && state.actionStats?.[p]) state.actionStats[p].mds = (state.actionStats[p].mds || 0) + 1;
        if (tactic === 'FC' && state.actionStats?.[p]) state.actionStats[p].fcs = (state.actionStats[p].fcs || 0) + 1;
      }
    });

    // 2. Queue re-entries
    const activeSurvivors = (state.players || []).filter(p => !isPlayerExceededLimit(p, { ...state, totals: nextTotals }) && !nextEliminated[p]);
    let entryScore = Math.round(exitLimit * 0.73);
    if (activeSurvivors.length > 0) {
      const maxScore = Math.max(...activeSurvivors.map(p => nextTotals[p] || 0));
      entryScore = maxScore + 1;
    }
    if (entryScore > exitLimit) entryScore = exitLimit;

    const queue: { player: string; score: number }[] = [];
    const updatedState = { ...state, totals: nextTotals, eliminated: nextEliminated };

    for (let p of (state.players || [])) {
      const canReEnter = canPlayerReEnter(p, updatedState);
      if (isPlayerExceededLimit(p, { ...state, totals: nextTotals }) && !nextEliminated[p]) {
        if (canReEnter) {
          queue.push({ player: p, score: entryScore });
        } else {
          updatedState.eliminated[p] = true; // No second chance
        }
      }
    }

    if (queue.length > 0) {
      setReEntryQueue(queue);
      setPendingEntry(entry);
      setPendingParticipants(allParticipants);
      setState(updatedState);
      
      // Pull first re-entry
      const nextActive = queue[0];
      setActiveReEntry(nextActive);
    } else {
      await finalizeRound(updatedState, entry, allParticipants);
    }
  };

  const handleReEntryDecision = async (accept: boolean) => {
    if (!activeReEntry || !state || !pendingEntry) return;

    const player = activeReEntry.player;
    const score = activeReEntry.score;

    const nextTotals = { ...state.totals };
    const nextEliminated = { ...state.eliminated };
    const nextReEntries = { ...(state.reEntries || {}) };
    const nextEntry = { ...pendingEntry };

    if (accept) {
      const currentCount = getPlayerReEntriesCount(player, state);
      nextReEntries[player] = currentCount + 1;
      nextTotals[player] = score;
      nextEntry.reentries[player] = score;
    } else {
      nextEliminated[player] = true;
    }

    const updatedState = { 
      ...state, 
      totals: nextTotals, 
      eliminated: nextEliminated, 
      reEntries: nextReEntries 
    };

    // Advance queue
    const remainingQueue = reEntryQueue.slice(1);
    setReEntryQueue(remainingQueue);

    if (remainingQueue.length > 0) {
      setState(updatedState);
      setPendingEntry(nextEntry);
      setActiveReEntry(remainingQueue[0]);
    } else {
      setActiveReEntry(null);
      setPendingEntry(null);
      await finalizeRound(updatedState, nextEntry, pendingParticipants);
    }
  };

  const finalizeRound = async (currentState: GameState, entry: RoundEntry, allParticipants: string[]) => {
    const updated = { ...currentState };

    // Capture who explicitly dealt the round that was just completed
    const currentDealer = getDealerForState(currentState);
    if (currentDealer) {
      entry.dealer = currentDealer;
    }

    allParticipants.forEach(p => {
      entry.totals[p] = updated.totals?.[p] !== undefined ? updated.totals[p] : 0;
    });

    if (!updated.history) updated.history = [];
    updated.history.push(entry);
    updated.round++;

    // Remove eliminated
    updated.players = (updated.players || []).filter(p => !updated.eliminated?.[p] && !isPlayerExceededLimit(p, updated));

    updated.players.forEach(p => {
      updated.roundScores[p] = null;
      if (updated.roundTactics) updated.roundTactics[p] = null;
    });

    const currentSurvivors = (updated.players || []).filter(p => !updated.eliminated?.[p] && !isPlayerExceededLimit(p, updated));
    
    if (currentSurvivors.length === 1) {
      updated.winner = currentSurvivors[0];
      updated.endTime = formatEliteDate(new Date());
    } else if (currentSurvivors.length === 0) {
      // Tie handler
      const participantsInLastRound = allParticipants.filter(p => updated.totals?.[p] !== undefined);
      if (participantsInLastRound.length > 0) {
        const minVal = Math.min(...participantsInLastRound.map(p => updated.totals?.[p] || 0));
        const winners = participantsInLastRound.filter(p => (updated.totals?.[p] || 0) === minVal);
        updated.winner = winners.length > 1 ? winners.join(' & ') : winners[0];
        updated.endTime = formatEliteDate(new Date());
      } else {
        updated.winner = 'No Winner';
        updated.endTime = formatEliteDate(new Date());
      }
    }

    // Optimistic UI update BEFORE await setDoc
    setState(updated);

    try {
      const docRef = doc(db, 'eliteGames', updated.id);
      await setDoc(docRef, updated);
    } catch (e) {
      console.error(e);
    }
  };

  // Add Mid game player logic
  const handleAddMidGame = async () => {
    if (!selectedMidPlayer || !state) return;
    const activeInRound = (state.players || []).filter(p => !state.eliminated?.[p] && !isPlayerExceededLimit(p, state));
    const survivorTotals = activeInRound.map(p => state.totals?.[p] || 0);
    
    let es = (survivorTotals.length > 0 ? Math.max(...survivorTotals) : 0) + 1;
    if (es > exitLimit) es = exitLimit;

    const previouslyInGame = state.totals?.[selectedMidPlayer] !== undefined;

    const updatedPlayers = [...(state.players || [])];
    const updatedTotals = { ...(state.totals || {}) };
    const updatedEliminated = { ...(state.eliminated || {}) };
    const updatedMidEntries = { ...(state.midGamePlayerEntries || {}) };
    const updatedReEntries = { ...(state.reEntries || {}) };

    if (!updatedPlayers.includes(selectedMidPlayer)) {
      updatedPlayers.push(selectedMidPlayer);
      updatedTotals[selectedMidPlayer] = es;
      updatedEliminated[selectedMidPlayer] = false;
      updatedMidEntries[selectedMidPlayer] = es;

      if (previouslyInGame) {
        const currentCount = getPlayerReEntriesCount(selectedMidPlayer, state);
        updatedReEntries[selectedMidPlayer] = currentCount + 1;
      }
    } else {
      updatedTotals[selectedMidPlayer] = es;
      updatedEliminated[selectedMidPlayer] = false;
    }

    const updatedScores = { ...(state.roundScores || {}) };
    const updatedTactics = { ...(state.roundTactics || {}) };
    updatedScores[selectedMidPlayer] = null;
    updatedTactics[selectedMidPlayer] = null;

    const updatedState = {
      ...state,
      players: updatedPlayers,
      totals: updatedTotals,
      eliminated: updatedEliminated,
      midGamePlayerEntries: updatedMidEntries,
      reEntries: updatedReEntries,
      roundScores: updatedScores,
      roundTactics: updatedTactics
    };

    if (updatedState.lastDropRound && updatedState.lastDropRound[selectedMidPlayer] === undefined) {
      updatedState.lastDropRound[selectedMidPlayer] = -1;
    }
    if (updatedState.actionStats && !updatedState.actionStats[selectedMidPlayer]) {
      updatedState.actionStats[selectedMidPlayer] = { shows: 0, fcs: 0, drops: 0, mds: 0 };
    }

    try {
      const docRef = doc(db, 'eliteGames', updatedState.id);
      await setDoc(docRef, updatedState);
      setState(updatedState);
      setIsMidGameOpen(false);
      setSelectedMidPlayer('');
    } catch (e) {
      console.error(e);
    }
  };

  // Editing historical round score sheets (Admin controls)
  const openEditRoundModal = (roundNum: number) => {
    if (!state || !state.history) return;
    const r = state.history.find(h => h.round === roundNum);
    if (!r) return;

    setEditRoundNum(roundNum);
    
    const initialData: { [player: string]: { score: string; tactic: string } } = {};
    const roundPlayers = r.players || state.startingPlayers || state.players || [];
    
    roundPlayers.forEach(p => {
      const sVal = r.scores[p];
      initialData[p] = {
        score: sVal === undefined || sVal === null ? '' : String(sVal),
        tactic: r.tactics?.[p] || ''
      };
    });

    setEditRoundData(initialData);
    setIsEditRoundOpen(true);
  };

  const setEditTacticState = (player: string, tactic: string) => {
    setEditRoundData(prev => {
      const current = { ...prev[player] };
      const currentTactic = String(current.tactic || '').trim().toUpperCase();
      const targetTactic = String(tactic || '').trim().toUpperCase();

      if (currentTactic === targetTactic) {
        // Toggle off the same tactic
        current.tactic = '';
        current.score = ''; // Clear default preset score on toggle-off
      } else {
        current.tactic = tactic;
        if (tactic === 'S') current.score = 'S';
        else if (tactic === 'D') current.score = '20';
        else if (tactic === 'MD') current.score = '40';
        else if (tactic === 'FC') current.score = '80';
        else if (tactic === 'FS') current.score = '0';
      }

      return { ...prev, [player]: current };
    });
  };

  const setEditOutState = (player: string) => {
    setEditRoundData(prev => {
      const current = { ...prev[player] };
      current.tactic = '';
      current.score = 'OUT';
      return { ...prev, [player]: current };
    });
  };

  const handleEditScoreChange = (player: string, value: string) => {
    setEditRoundData(prev => {
      const current = { ...prev[player] };
      current.score = value;
      // When user manually types any score, auto-deactivate the active tactic style
      current.tactic = '';
      return { ...prev, [player]: current };
    });
  };

  const saveEditedScores = async () => {
    if (!state || !editRoundNum || !state.history) return;

    const updatedHistory = state.history.map(r => {
      if (r.round !== editRoundNum) return r;

      const nextScores = { ...r.scores };
      const nextTactics = { ...(r.tactics || {}) };

      Object.keys(editRoundData).forEach(p => {
        const { score, tactic } = editRoundData[p];
        const val = score.trim().toUpperCase();

        let finalTactic = tactic || '';
        // If the manually entered score does not match the chosen tactic, deactivate it completely.
        if (finalTactic === 'S' && val !== 'S') finalTactic = '';
        else if (finalTactic === 'D' && val !== '20') finalTactic = '';
        else if (finalTactic === 'MD' && val !== '40') finalTactic = '';
        else if (finalTactic === 'FC' && val !== '80') finalTactic = '';
        else if (finalTactic === 'FS' && val !== '0') finalTactic = '';

        if (val === '') {
          nextScores[p] = null;
        } else if (val === 'OUT') {
          nextScores[p] = 'OUT';
          finalTactic = '';
        } else if (val === 'S') {
          nextScores[p] = 'S';
          finalTactic = 'S';
        } else {
          const num = parseInt(val);
          nextScores[p] = isNaN(num) ? null : num;
        }

        nextTactics[p] = finalTactic || null;
      });

      return {
        ...r,
        scores: nextScores,
        tactics: nextTactics
      };
    });

    const nextState = { ...state, history: updatedHistory };
    recalculateStateFromHistory(nextState);

    // Optimistic UI update BEFORE await setDoc
    setState(nextState);
    setIsEditRoundOpen(false);
    setEditRoundNum(null);

    try {
      const docRef = doc(db, 'eliteGames', nextState.id);
      await setDoc(docRef, nextState);
    } catch (e) {
      console.error(e);
      alert('Failed to update historical round scores in Database.');
    }
  };

  const recalculateStateFromHistory = (g: GameState) => {
    const lim = getExitLimitFor(g);
    g.totals = {};
    g.eliminated = {};
    g.reEntries = {};
    g.lastDropRound = {};
    g.actionStats = {};

    const allUnique = new Set(g.startingPlayers || g.players || []);
    if (g.players) g.players.forEach(p => allUnique.add(p));
    if (g.history) {
      g.history.forEach(r => {
        if (r.players) r.players.forEach(p => allUnique.add(p));
        if (r.scores) Object.keys(r.scores).forEach(p => allUnique.add(p));
      });
    }

    const starting = g.startingPlayers || g.players || [];

    allUnique.forEach(p => {
      let startingScore = 0;
      if (!starting.includes(p)) {
        if (g.midGamePlayerEntries && g.midGamePlayerEntries[p] !== undefined) {
          startingScore = g.midGamePlayerEntries[p];
        } else {
          const firstRound = g.history ? g.history.find(h => 
            (h.players && h.players.includes(p)) || (h.scores && h.scores[p] !== undefined)
          ) : null;
          if (firstRound?.totals?.[p] !== undefined) {
            let pts = 0;
            const val = firstRound.scores[p];
            if (val === 'S' || val === 'OUT') pts = 0;
            else pts = parseInt(String(val)) || 0;
            startingScore = firstRound.totals[p] - pts;
            if (startingScore < 0) startingScore = 0;
          }
        }
      }

      g.totals[p] = startingScore;
      g.eliminated[p] = false;
      g.reEntries[p] = 0;
      g.lastDropRound[p] = -1;
      g.actionStats[p] = { shows: 0, fcs: 0, drops: 0, mds: 0 };
    });

    g.history.forEach((r, idx) => {
      const roundNum = idx + 1;
      r.round = roundNum;
      if (!r.reentries) r.reentries = {};
      if (!r.bustedTotals) r.bustedTotals = {};
      if (!r.totals) r.totals = {};

      const activeThisRound = r.players || starting;

      activeThisRound.forEach(p => {
        if (r.players && r.players.includes(p)) {
          g.eliminated[p] = false;
        }

        if (g.eliminated[p]) return;

        const val = r.scores[p];
        const tactic = r.tactics?.[p] || null;

        if (val === 'OUT') {
          g.totals[p] = lim;
          g.eliminated[p] = true;
          r.totals[p] = lim;
          return;
        }

        let points = 0;
        if (val === 'S') points = 0;
        else points = parseInt(String(val)) || 0;

        g.totals[p] = (g.totals[p] || 0) + points;

        if (tactic === 'S' && g.actionStats[p]) g.actionStats[p].shows++;
        if (tactic === 'D' && g.actionStats[p]) {
          g.actionStats[p].drops++;
          g.lastDropRound[p] = roundNum;
        }
        if (tactic === 'MD' && g.actionStats[p]) g.actionStats[p].mds++;
        if (tactic === 'FC' && g.actionStats[p]) g.actionStats[p].fcs++;

        if (g.totals[p] >= lim) {
          r.bustedTotals[p] = g.totals[p];
          if (r.reentries[p] !== undefined) {
            const prevRE = g.reEntries[p];
            const currentCount = typeof prevRE === 'number' ? prevRE : (prevRE === true ? 1 : 0);
            g.reEntries[p] = currentCount + 1;
            g.totals[p] = r.reentries[p];
          } else {
            g.eliminated[p] = true;
          }
        }

        r.totals[p] = g.totals[p];
      });
    });

    g.players = Array.from(allUnique).filter(p => !g.eliminated[p] && (g.totals[p] || 0) < lim);

    const activeSurvivors = g.players;
    if (activeSurvivors.length === 0) {
      const allInLast = Array.from(allUnique).filter(p => !g.eliminated[p] || g.totals[p] >= lim);
      const minScore = Math.min(...allInLast.map(p => g.totals[p] || 0));
      const winners = allInLast.filter(p => (g.totals[p] || 0) === minScore);
      g.winner = winners.length > 1 ? winners.join(' & ') : winners[0];
      g.endTime = g.endTime || formatEliteDate(new Date());
    } else {
      g.winner = null;
      g.endTime = null;
      g.round = g.history.length + 1;

      g.players.forEach(p => {
        g.roundScores[p] = null;
        g.roundTactics[p] = null;
      });
    }
  };

  const isRoundInProgress = Object.keys(state.roundScores || {}).some(p => {
    const isNotOut = !state.eliminated?.[p] && (state.totals?.[p] || 0) < exitLimit;
    return isNotOut && state.roundScores[p] !== null;
  });

  const lobbyInGameCandidate = playersDb.filter(p => {
    const name = p.fullName;
    const isCurrentlyIn = state.players?.includes(name) && !state.eliminated?.[name] && !isPlayerExceededLimit(name, state);
    const canRE = canPlayerReEnter(name, state);
    const wasIn = state.totals?.[name] !== undefined;

    if (wasIn) {
      return !isCurrentlyIn && canRE;
    }
    return !isCurrentlyIn;
  });

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto bg-[#1a252f] rounded-2xl shadow-xl mt-4 border border-white/5 min-h-[500px]">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center pb-3 border-b border-white/10 gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <button 
            type="button" 
            onClick={() => setIsTVOpen(true)}
            className="bg-gradient-to-b from-[var(--accent)] to-emerald-700 hover:opacity-90 min-w-20 h-8 flex items-center justify-center font-bold text-xs rounded border border-white/20 shadow shadow-emerald-500/10 cursor-pointer"
          >
            TV Board
          </button>
          
          <button 
            type="button" 
            onClick={() => setIsSeatCutOpen(true)}
            className="bg-gradient-to-b from-amber-600 to-yellow-500 hover:brightness-110 min-w-20 h-8 flex items-center justify-center font-bold text-xs rounded border border-white/20 shadow shadow-amber-500/10 text-slate-900 cursor-pointer"
          >
            Seat Cut 🃏
          </button>

          {state.seatCutOutcome && (
            <button 
              type="button" 
              onClick={() => setShowSeatCutAuditLog(true)}
              className="bg-gradient-to-b from-purple-600 to-indigo-700 hover:opacity-90 min-w-20 h-8 px-2.5 flex items-center justify-center font-bold text-xs rounded border border-white/20 shadow shadow-purple-500/10 text-white cursor-pointer"
            >
              Seat Cut Log
            </button>
          )}
          
          <div className="flex flex-col flex-1 min-w-[150px]">
            {isGameOver ? (
              <h3 className="font-extrabold text-sm text-[#e74c3c] tracking-tight uppercase">Game Over</h3>
            ) : isEditingName ? (
              <div className="flex gap-1.5 items-center w-full">
                <input 
                  type="text" 
                  className="std-input h-7 text-xs bg-slate-800 border-white/10 text-white p-1 flex-1 rounded focus:outline-none" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveGameNameInline();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                />
                <button onClick={saveGameNameInline} className="bg-emerald-600 px-2 py-1 text-[10px] rounded font-bold cursor-pointer hover:bg-emerald-500">Save</button>
                <button onClick={() => setIsEditingName(false)} className="bg-slate-700 px-2 py-1 text-[10px] rounded font-bold cursor-pointer hover:bg-slate-600">X</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => isAdmin() && setIsEditingName(true)}>
                <h3 className="text-md font-bold text-slate-100 hover:text-[var(--accent)] transition duration-200">
                  {state.name || 'Tournament'}
                </h3>
                {isAdmin() && (
                  <svg className="w-3.5 h-3.5 text-[var(--accent)] hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
              </div>
            )}
            {!isEditingName && (
              <span className="text-[10px] opacity-60">ROUND {state.round} • Admin: {state.admin || 'System'}</span>
            )}
          </div>
        </div>

        <button 
          onClick={onExit}
          className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded text-white border border-white/10 cursor-pointer"
        >
          {isGameOver ? 'Home' : 'Pause'}
        </button>
      </div>

      {/* CORE ACTIVE TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[50%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 text-xs text-slate-300 font-bold opacity-70 uppercase tracking-widest text-[#95a5a6]">
              <th className="py-2">Player</th>
              <th className="py-2 text-center">Tactics / Manual</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(isGameOver ? state.players : state.players?.filter(p => !state.eliminated?.[p] && !isPlayerExceededLimit(p, state)))?.map(p => {
              const rs = state.roundScores?.[p];
              const isOut = state.eliminated?.[p] || isPlayerExceededLimit(p, state);
              const dLock = state.lastDropRound?.[p] === (state.round - 1);
              const tactic = state.roundTactics?.[p] || null;

              const reCount = getPlayerReEntriesCount(p, state);
              const isPendingOut = (rs === 'OUT');
              const isS = (rs === 'S');

              return (
                <tr 
                  key={p} 
                  className={`border-b border-white/5 text-xs text-slate-200 transition ${isOut ? 'opacity-30' : ''}`}
                >
                  {/* Name section */}
                  <td className="py-3 font-semibold text-slate-100 flex flex-col gap-0.5 max-w-full truncate">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      {p === dealer && <span className="bg-yellow-500 text-black px-1.5 py-0.5 rounded font-black text-[9px] uppercase tracking-wider shadow">D</span>}
                      <span className="truncate max-w-[100px]">{p}</span>
                    </span>
                    {reCount > 0 && (
                      <span className="text-[8px] bg-[#9b59b6] px-1 py-0.2 rounded font-black uppercase text-white tracking-widest self-start mt-0.5">
                        RE ({reCount})
                      </span>
                    )}
                  </td>

                  {/* Tactics Keyboard */}
                  <td className="py-3">
                    <div className="flex flex-col gap-1.5 items-center justify-center">
                      <div className="flex gap-1 flex-wrap justify-center">
                        <button 
                          onClick={() => setTactic(p, 'S')}
                          disabled={isOut || isGameOver}
                          className={`tactic-btn text-[10px] w-7 h-7 flex items-center justify-center font-black rounded cursor-pointer transition active:scale-95 ${(rs === 'S' || String(rs) === 'S') && tactic === 'S' ? 'bg-[#2ecc71] text-white font-extrabold shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-emerald-400 border border-emerald-500/20 hover:bg-slate-700'}`}
                        >
                          S
                        </button>
                        <button 
                          onClick={() => setTactic(p, 'D')}
                          disabled={isOut || dLock || isGameOver}
                          className={`tactic-btn text-[10px] w-7 h-7 flex items-center justify-center font-black rounded cursor-pointer transition active:scale-95 ${(rs === 20 || String(rs) === '20') && tactic === 'D' ? 'bg-[#f1c40f] text-black font-extrabold shadow-lg shadow-yellow-500/20' : 'bg-slate-800 text-yellow-500 border border-yellow-500/20 hover:bg-slate-700 disabled:opacity-20'}`}
                          title={dLock ? 'Drop Locked from previous round' : 'Standard Drop (20 points)'}
                        >
                          D
                        </button>
                        <button 
                          onClick={() => setTactic(p, 'MD')}
                          disabled={isOut || isGameOver}
                          className={`tactic-btn text-[10px] w-7 h-7 flex items-center justify-center font-black rounded cursor-pointer transition active:scale-95 ${(rs === 40 || String(rs) === '40') && tactic === 'MD' ? 'bg-[#9b59b6] text-white font-extrabold shadow-lg shadow-purple-500/30' : 'bg-slate-800 text-purple-400 border border-purple-500/20 hover:bg-slate-700'}`}
                        >
                          MD
                        </button>
                        <button 
                          onClick={() => setTactic(p, 'FC')}
                          disabled={isOut || isGameOver}
                          className={`tactic-btn text-[10px] w-7 h-7 flex items-center justify-center font-black rounded cursor-pointer transition active:scale-95 ${(rs === 80 || String(rs) === '80') && tactic === 'FC' ? 'bg-[#e74c3c] text-white font-extrabold shadow-lg shadow-red-500/30' : 'bg-slate-800 text-red-500 border border-red-500/10 hover:bg-slate-700'}`}
                        >
                          FC
                        </button>
                        <button 
                          onClick={() => setTactic(p, 'FS')}
                          disabled={isOut || isGameOver}
                          className={`tactic-btn text-[10px] w-7 h-7 flex items-center justify-center font-black rounded cursor-pointer transition active:scale-95 ${(rs === 0 || String(rs) === '0') && tactic === 'FS' ? 'bg-[#efefef] text-slate-800 font-extrabold shadow-lg shadow-slate-300/30' : 'bg-slate-800 text-slate-300 border border-slate-700/50 hover:bg-slate-700'}`}
                        >
                          FS
                        </button>
                      </div>

                      <div className="flex gap-1.5 w-full max-w-[170px] items-center">
                        <button 
                          onClick={() => markOut(p)}
                          disabled={isGameOver}
                          className="bg-[#e74c3c]/15 text-[#e74c3c] border border-[#e74c3c]/30 hover:bg-[#e74c3c]/30 text-[9px] font-black h-7 px-2.5 rounded transition cursor-pointer"
                        >
                          OUT
                        </button>
                        
                        {/* MANUAL ENTRY INPUT (Outstanding Request 2: No automatic tactic/drop lock highlights) */}
                        <input 
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="std-input h-7 m-0 text-center text-xs font-bold bg-[#111] text-white border-white/10 rounded focus:border-[var(--accent)] flex-1 focus:outline-none"
                          style={{
                            background: (isOut || isPendingOut || isS || isGameOver) ? '#2c3e50' : '#fff',
                            color: (isOut || isPendingOut || isS || isGameOver) ? '#7f8c8d' : '#111'
                          }}
                          value={isGameOver ? (state.totals?.[p] || BigInt(0).toString()) : (isOut ? 'OUT' : (rs === null ? '' : rs))}
                          onChange={(e) => manualInput(p, e.target.value)}
                          disabled={isOut || isPendingOut || isS || isGameOver}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Individual total score section */}
                  <td className="py-3 text-right font-mono font-bold text-slate-100 pr-1">
                    <span className={isOut || isPendingOut ? 'text-[#e74c3c] font-black tracking-wider text-[11px]' : 'text-yellow-500'}>
                      {isOut || isPendingOut ? 'OUT' : (state.totals?.[p] !== undefined ? state.totals[p] : 0)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER ACTIONS AND SCORE SUBMISSIONS */}
      {!isGameOver ? (
        <div className="flex flex-col gap-2 mt-4">
          <button 
            onClick={triggerNextRound}
            className="actionBtn bg-[var(--accent)] hover:opacity-95 text-white py-3.5 rounded-xl font-extrabold transition text-sm active:scale-99 shadow-lg shadow-emerald-700/20 cursor-pointer"
          >
            End and Recalculate Round ({state.round + 1})
          </button>
          <button 
            onClick={() => setIsMidGameOpen(true)}
            disabled={isRoundInProgress}
            className={`actionBtn py-2.5 rounded text-xs font-semibold ${isRoundInProgress ? 'bg-slate-800 text-slate-600 border border-slate-700/20 cursor-not-allowed opacity-50' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 cursor-pointer'}`}
            title={isRoundInProgress ? 'Cannot add player while scores are being active for this round.' : 'Add player mid-game'}
          >
            + Add Player Mid-Game
          </button>
        </div>
      ) : (
        <div className="text-center bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-xl mt-4">
          <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-widest">🏆 Ultimate Winner 🏆</div>
          <div className="text-xl font-black text-yellow-500 drop-shadow">{state.winner}</div>
        </div>
      )}

      {/* PAST PLAYERS SUMMARY TABLE */}
      {Object.keys(state.totals || {}).filter(p => !state.players?.includes(p) || state.eliminated?.[p] || isPlayerExceededLimit(p, state)).length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3 text-xs opacity-75 leading-relaxed text-slate-300">
          <strong>PAST COMPLIANT EXITS:</strong>
          <p className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
            {Object.keys(state.totals || {})
              .filter(p => !state.players?.includes(p) || state.eliminated?.[p] || isPlayerExceededLimit(p, state))
              .map(p => {
                const count = getPlayerReEntriesCount(p, state);
                return (
                  <span key={p} className="bg-slate-800 py-0.5 px-2 rounded border border-white/5">
                    {p} {count > 0 ? `(RE:${count})` : ''}: <span className="text-red-400 font-bold">{state.totals[p]}</span>
                  </span>
                );
              })}
          </p>
        </div>
      )}

      {/* GAME REPORTS AND SCOREBOARD HISTORIES LOG */}
      <div className="mt-4 bg-black/40 p-4 border border-white/5 rounded-xl text-left">
        <h4 className="text-xs font-extrabold text-[var(--accent)] mb-3 tracking-widest uppercase">Scoreboard Logs</h4>
        
        {(!state.history || state.history.length === 0) ? (
          <div className="text-xs text-slate-500 text-center py-2">Waiting for first round completions...</div>
        ) : (
          <div className="flex flex-col gap-3 max-h-56 overflow-y-auto pr-1">
            {state.history.slice().reverse().map(r => {
              const isLatest = r.round === state.history.length;
              return (
                <div key={r.round} className="text-[11px] pb-2 border-b border-white/5 leading-relaxed text-slate-300 flex justify-between items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <strong className="text-[var(--accent)]">Round {r.round}:</strong>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 font-mono text-[10px]">
                      {(r.players || state.startingPlayers || state.players || []).map(pName => {
                        const scoreVal = r.scores[pName];
                        const playerTotalVal = r.totals?.[pName];
                        const wasRE = r.reentries?.[pName] !== undefined;
                        const tac = r.tactics?.[pName] || null;

                        const displayStr = tac ? String(tac) : (scoreVal === undefined || scoreVal === null ? '-' : String(scoreVal));
                        const isExceeded = playerTotalVal !== undefined && isPlayerExceededLimit(pName, { ...state, totals: r.totals });
                        if (scoreVal === 'OUT' || (isExceeded && !wasRE)) {
                          return (
                            <span key={pName} className="text-[#e74c3c]">
                              {pName}{wasRE ? '(RE)' : ''}: OUT ({exitLimit})
                            </span>
                          );
                        }
                        return (
                          <span key={pName} className="text-slate-300">
                            {pName}{wasRE ? '(RE)' : ''}: {displayStr} ({playerTotalVal !== undefined ? playerTotalVal : '-'})
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {isLatest && (
                    <div className="self-center">
                      {isAdmin() ? (
                        <button 
                          onClick={() => openEditRoundModal(r.round)}
                          className="bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 hover:text-white px-2 py-1 rounded text-[10px] font-bold text-[var(--accent)] transition duration-150 cursor-pointer"
                        >
                          Edit Round
                        </button>
                      ) : (
                        <button 
                          disabled 
                          className="bg-white/2 border border-white/5 py-1 px-2 text-[10px] rounded text-slate-500 cursor-not-allowed"
                          title="Only Game Admin can edit historical rounds"
                        >
                          Inactive
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SEQUENTIAL AUTHORIZED RE-ENTRY MODALS AND AGENT RULES */}
      {activeReEntry && (
        <div className="modal-overlay flex items-center justify-center fixed inset-0 z-[8000] bg-black/85 backdrop-blur-md p-4">
          <div className="modal-card bg-[#1a252f] w-full max-w-[340px] p-6 rounded-2xl border border-white/5 text-center shadow-2xl">
            <h3 className="text-yellow-500 font-extrabold text-lg mb-2 uppercase">Re-entry Prompt</h3>
            
            {isPlayerExceededLimit(activeReEntry.player, { ...state, totals: { [activeReEntry.player]: activeReEntry.score } }) ? (
              <div className="text-xs text-slate-300 leading-normal mb-6 flex flex-col gap-2">
                <span className="text-red-500 font-black text-sm">NO POINTS AVAILABLE TO RE-ENTRY</span>
                <span><strong>{activeReEntry.player}</strong> reached <strong>{exitLimit}+</strong> and is eliminated automatically.</span>
              </div>
            ) : (
              <div className="text-xs text-slate-300 leading-normal mb-6">
                <span><strong>{activeReEntry.player}</strong> reached <strong>{exitLimit}+</strong>.</span>
                <br />
                <span className="text-yellow-500 font-extrabold mt-1 inline-block">Recontract re-entry at {activeReEntry.score} points?</span>
              </div>
            )}

            <div className="flex gap-2">
              {!isPlayerExceededLimit(activeReEntry.player, { ...state, totals: { [activeReEntry.player]: activeReEntry.score } }) ? (
                <>
                  <button 
                    onClick={() => handleReEntryDecision(false)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs py-2 px-3 rounded cursor-pointer"
                  >
                    Leave
                  </button>
                  <button 
                    onClick={() => handleReEntryDecision(true)}
                    className="flex-1 bg-[var(--accent)] hover:opacity-90 text-white font-extrabold text-xs py-2 px-3 rounded cursor-pointer"
                  >
                    Confirm Re-entry
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => handleReEntryDecision(false)}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs py-2 px-4 rounded cursor-pointer"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD PLAYERS MID-GAME MODAL */}
      {isMidGameOpen && (
        <div className="modal-overlay flex items-center justify-center fixed inset-0 z-[7500] bg-black/80 p-4">
          <div className="modal-card bg-[#1a252f] w-full max-w-[340px] p-6 rounded-2xl border border-white/5 shadow-2xl">
            <h3 className="text-slate-100 font-bold text-md mb-3 text-center">Add Player Mid-game</h3>
            
            <p className="text-[11px] text-slate-400 mb-4 leading-normal">
              A player joining mid-game takes the highest score among current survivors + 1 (capped at exit limit).
            </p>

            <select 
              className="std-input w-full p-2 bg-slate-800 border-white/10 rounded text-slate-100 text-sm mb-4 focus:outline-none focus:border-[var(--accent)]"
              value={selectedMidPlayer}
              onChange={(e) => setSelectedMidPlayer(e.target.value)}
            >
              <option value="">-- Select Lobby Player --</option>
              {lobbyInGameCandidate.map(lp => (
                <option key={lp.id} value={lp.fullName}>{lp.fullName}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button 
                onClick={() => setIsMidGameOpen(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-xs py-2 px-4 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddMidGame}
                disabled={!selectedMidPlayer}
                className="flex-1 bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-xs py-2 px-4 rounded font-bold cursor-pointer"
              >
                Add Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HISTORICAL ROUNDS SCORE SHEET MODAL */}
      {isEditRoundOpen && editRoundNum && (
        <div className="modal-overlay flex items-center justify-center fixed inset-0 z-[7500] bg-black/80 overflow-y-auto p-4">
          <div className="modal-card bg-[#1a252f] w-full max-w-[400px] p-6 rounded-2xl border border-white/5 shadow-2xl text-left">
            <h3 className="text-md font-extrabold text-[var(--accent)] text-center mb-4 uppercase">
              Edit Round {editRoundNum} Scores
            </h3>

            <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto pr-1 mb-4">
              {Object.keys(editRoundData).map(pName => {
                const item = editRoundData[pName];
                return (
                  <div key={pName} className="bg-white/3 p-3 rounded-lg border border-white/5 flex flex-col gap-2">
                    <div className="font-bold text-xs text-white uppercase">{pName}</div>
                    
                    <div className="flex gap-1 flex-wrap">
                      {['S', 'D', 'MD', 'FC', 'FS'].map(tType => {
                        const isActive = String(item.tactic || '').trim().toUpperCase() === String(tType || '').trim().toUpperCase();
                        return (
                          <button 
                            key={tType}
                            type="button"
                            onClick={() => setEditTacticState(pName, tType)}
                            className={`px-2 py-1 text-[9px] font-bold rounded cursor-pointer transition ${isActive ? 'bg-yellow-500 text-black font-extrabold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                          >
                            {tType}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 items-center">
                      <button 
                        type="button"
                        onClick={() => setEditOutState(pName)}
                        className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-2 py-1.5 rounded text-[10px] font-black cursor-pointer"
                      >
                        OUT
                      </button>
                      <input 
                        type="text" 
                        className="std-input h-8 text-center text-xs text-slate-900 font-extrabold flex-1 rounded focus:outline-none"
                        style={{ background: '#fff' }}
                        value={item.score}
                        placeholder="Points"
                        onChange={(e) => handleEditScoreChange(pName, e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => { setIsEditRoundOpen(false); setEditRoundNum(null); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-xs py-2 px-4 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={saveEditedScores}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs py-2 px-4 rounded cursor-pointer"
              >
                Save Scores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN TV SCOREBOARD ASPECT DISPLAY */}
      <Scoreboard 
        isOpen={isTVOpen} 
        onClose={() => setIsTVOpen(false)} 
        state={state} 
        playersDb={playersDb} 
      />

      {/* SEAT CUT PROTOCOL OVERLAY */}
      <SeatCutModal
        isOpen={isSeatCutOpen}
        onClose={() => setIsSeatCutOpen(false)}
        players={state.startingPlayers || state.players || []}
        gameId={state.id}
        tableName={state.name}
        onFinalize={async (results) => {
          try {
            const docRef = doc(db, 'eliteGames', state.id);
            await updateDoc(docRef, {
              players: results.shuffledPlayers,
              startingPlayers: results.shuffledPlayers,
              seatCutOutcome: results
            });
            setState(prev => {
              if (!prev) return null;
              return {
                ...prev,
                players: results.shuffledPlayers,
                startingPlayers: results.shuffledPlayers,
                seatCutOutcome: results
              };
            });
            alert('Seat Cut protocols successfully completed, clockwise positions structured, and starting dealer selected!');
          } catch (e) {
            console.error('Failed to update game sequence:', e);
            alert('Failed to apply Seat Cut outcomes to the active game. Verify active connection.');
          }
        }}
      />

      {/* SEAT CUT AUDIT LOG DETAIL MODAL */}
      {showSeatCutAuditLog && state.seatCutOutcome && (
        <div className="modal-overlay flex items-center justify-center fixed inset-0 z-[8500] bg-black/90 backdrop-blur-md p-4 text-left">
          <div className="modal-card bg-[#16222f] w-full max-w-xl p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto font-sans text-white">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="text-md md:text-lg font-black text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                <span>📜 Seat Cut Protocol Audit Log</span>
              </h3>
              <button 
                onClick={() => setShowSeatCutAuditLog(false)}
                className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer underline bg-transparent border-none outline-none"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col gap-4 mt-4">
              {/* Highlight Starting Dealer */}
              <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-red-400 tracking-wider block mb-1">
                  Designated Starting Dealer
                </span>
                <span className="text-base md:text-lg font-black text-white font-mono tracking-wide uppercase flex items-center gap-2">
                  👑 Starting Dealer: {state.seatCutOutcome.dealer}
                </span>
              </div>

              {/* Seating Order List */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Clockwise Seating Order
                </span>
                <div className="flex flex-col gap-2 mt-1 font-mono text-xs">
                  {state.seatCutOutcome.seatingOrder.map((s) => {
                    const isDealer = s.player === state.seatCutOutcome?.dealer;
                    return (
                      <div 
                        key={s.seat} 
                        className={`flex justify-between items-center p-3 rounded-xl border ${
                          isDealer 
                            ? 'bg-red-900/10 border-red-500/20' 
                            : (s.rank === 1 ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-slate-950/50 border-white/5')
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-white text-sm">
                            Seat {s.seat}: {s.player}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase">
                            {isDealer ? '👑 Designated Starting Dealer' : (s.rank === 1 ? '🌟 Seat 1 (Highest Rank Selection)' : `Rank ${s.rank}`)}
                          </span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="bg-slate-900 py-1 px-3 rounded font-black border border-white/5 text-[var(--accent)] text-xs shadow-inner">
                            {s.card}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Clockwise Distribution sequence */}
              {state.seatCutOutcome.distributionOrder && (
                <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 flex flex-col gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Clockwise Distribution sequence
                  </span>
                  <div className="flex flex-col gap-1.5 text-xs font-mono mt-1">
                    {state.seatCutOutcome.distributionOrder.map((pName, idx) => (
                      <div key={pName} className="flex gap-3 items-center">
                        <span className="text-[10px] text-slate-500 font-bold w-4">
                          {idx + 1}.
                        </span>
                        <span className={idx === 0 ? 'text-emerald-400 font-bold' : (pName === state.seatCutOutcome?.dealer ? 'text-red-400 font-bold' : 'text-slate-300')}>
                          {pName} {idx === 0 ? '(Receives First, clock-one)' : (pName === state.seatCutOutcome?.dealer ? '(Dealer last)' : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowSeatCutAuditLog(false)}
              className="mt-6 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-bold cursor-pointer text-xs uppercase font-sans transition"
            >
              Back to Scoreboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
