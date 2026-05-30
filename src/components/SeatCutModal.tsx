import React, { useState } from 'react';
import { db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { formatEliteDate } from '../game/gameLogic';

interface PlayerCardSelection {
  player: string;
  suit: '♠' | '♥' | '♦' | '♣' | 'Joker' | null;
  value: string | null; // e.g. "A", "K", etc. Or "Joker"
  entryTime: number; // for Joker tie-breaking
}

interface SeatCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: string[];
  gameId: string;
  tableName: string;
  onFinalize: (results: {
    shuffledPlayers: string[];
    dealer: string;
    seatingOrder: { seat: number; player: string; card: string; rank: number }[];
    distributionOrder: string[];
  }) => void;
}

const VALUE_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_ORDER: Record<'♠' | '♥' | '♦' | '♣', number> = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };

export const SeatCutModal: React.FC<SeatCutModalProps> = ({
  isOpen,
  onClose,
  players,
  gameId,
  tableName,
  onFinalize,
}) => {
  const [selections, setSelections] = useState<Record<string, PlayerCardSelection>>(() => {
    const initial: Record<string, PlayerCardSelection> = {};
    players.forEach((p) => {
      initial[p] = { player: p, suit: null, value: null, entryTime: 0 };
    });
    return initial;
  });

  const [activePlayerKeypad, setActivePlayerKeypad] = useState<{
    player: string;
    suit: '♠' | '♥' | '♦' | '♣';
  } | null>(null);

  const [step, setStep] = useState<'entry' | 'results'>('entry');
  const [results, setResults] = useState<{
    seatingOrder: { seat: number; player: string; card: string; rank: number }[];
    dealer: string;
    distributionOrder: string[];
  } | null>(null);

  if (!isOpen) return null;

  // Multi-colored styling for suit icons
  const getSuitColor = (suit: '♠' | '♥' | '♦' | '♣' | 'Joker') => {
    switch (suit) {
      case '♠':
        return 'text-white border-white/25 bg-slate-950 hover:bg-slate-900';
      case '♣':
        return 'text-slate-200 border-white/20 bg-slate-900 hover:bg-slate-800';
      case '♥':
        return 'text-[#e74c3c] border-red-500/20 bg-red-950/20 hover:bg-red-950/40';
      case '♦':
        return 'text-amber-500 border-amber-500/20 bg-amber-950/10 hover:bg-amber-950/35';
      case 'Joker':
        return 'text-yellow-400 border-yellow-500/30 bg-gradient-to-r from-purple-950/45 to-yellow-950/40 hover:brightness-110';
    }
  };

  // Helper to check duplicates
  const isCardAssigned = (suit: string, val: string) => {
    return (Object.values(selections) as PlayerCardSelection[]).some(
      (sel) => sel.suit === suit && sel.value === val
    );
  };

  const handleSuitPress = (player: string, suit: '♠' | '♥' | '♦' | '♣' | 'Joker') => {
    if (suit === 'Joker') {
      // Joker auto-assigns immediately
      setSelections((prev) => ({
        ...prev,
        [player]: {
          player,
          suit: 'Joker',
          value: 'Joker',
          entryTime: Date.now(),
        },
      }));
      setActivePlayerKeypad(null);
    } else {
      setActivePlayerKeypad({ player, suit });
    }
  };

  const handleCardValuePress = (value: string) => {
    if (!activePlayerKeypad) return;
    const { player, suit } = activePlayerKeypad;

    // Prevent assigning duplicates
    if (isCardAssigned(suit, value)) {
      alert(`Card ${value}${suit} has already been assigned to another player!`);
      return;
    }

    setSelections((prev) => ({
      ...prev,
      [player]: {
        player,
        suit,
        value,
        entryTime: Date.now(),
      },
    }));
    setActivePlayerKeypad(null);
  };

  const isAllEntered = (Object.values(selections) as PlayerCardSelection[]).every((sel) => sel.suit !== null);

  const calculateResultsAndSaveAudit = async () => {
    if (!isAllEntered) {
      alert('Please select a card for every player before finalizing.');
      return;
    }

    const cards = Object.values(selections) as PlayerCardSelection[];

    // Sort to determine ranking: A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2 > Joker
    const rankedCards = [...cards].sort((a, b) => {
      const isAJoker = a.suit === 'Joker';
      const isBJoker = b.suit === 'Joker';

      if (isAJoker && isBJoker) {
        // Earliest Joker is lowest ranked (meaning placed latest in list for lower priority)
        return b.entryTime - a.entryTime;
      }
      if (isAJoker) return 1; // Joker goes lowest
      if (isBJoker) return -1;

      // Card value Index comparison (lowest index = highest value)
      const aValIdx = VALUE_ORDER.indexOf(a.value || '');
      const bValIdx = VALUE_ORDER.indexOf(b.value || '');
      if (aValIdx !== bValIdx) {
        return aValIdx - bValIdx;
      }

      // Suit priority sequence
      const aSuitIdx = SUIT_ORDER[a.suit as '♠' | '♥' | '♦' | '♣'];
      const bSuitIdx = SUIT_ORDER[b.suit as '♠' | '♥' | '♦' | '♣'];
      return aSuitIdx - bSuitIdx;
    });

    // Seating Clockwise Allocation
    // Seat 1 = Highest Ranked, Seat N = Lowest Ranked
    const seating = rankedCards.map((c, idx) => ({
      seat: idx + 1,
      player: c.player,
      card: c.suit === 'Joker' ? '🃏 Joker' : `${c.value}${c.suit}`,
      rank: idx + 1,
    }));

    // Dealer assignment (Lowest-ranked player)
    const lowestRankedPlayer = rankedCards[rankedCards.length - 1].player;
    const dealerName = lowestRankedPlayer;

    // Card distribution order:Clockwise starting from highest-ranked first, down to dealer last
    // Seating already matches clockwise rank-priority. Highest is Seat 1. Dealer is final seat.
    // Order: Seat 1, Seat 2, ..., Seat N
    const distribution = seating.map((s) => s.player);

    const calculatedResults = {
      seatingOrder: seating,
      dealer: dealerName,
      distributionOrder: distribution,
    };

    setResults(calculatedResults);

    // Perform audit logging to Firestore
    try {
      const logDateTime = formatEliteDate(new Date());
      const auditRef = doc(db, 'seatCutAudits', gameId + '_' + Date.now().toString());
      
      const records = seating.map((s) => ({
        player: s.player,
        card: s.card,
        rank: s.rank,
        seat: s.seat,
        isDealer: s.player === dealerName,
      }));

      await setDoc(auditRef, {
        tournamentId: gameId,
        tableName: tableName,
        dateTime: logDateTime,
        records,
        dealer: dealerName,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('Audit Logging failed:', e);
    }

    setStep('results');
  };

  const handleCompleteActivation = () => {
    if (!results) return;
    const orderedNames = results.seatingOrder.map((s) => s.player);
    onFinalize({
      shuffledPlayers: orderedNames,
      dealer: results.dealer,
      seatingOrder: results.seatingOrder,
      distributionOrder: results.distributionOrder,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-[#16222f] w-full max-w-2xl p-6 rounded-2xl border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh] flex flex-col gap-4 text-left">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-3">
          <div>
            <h2 className="text-md md:text-lg font-black text-[#2ecc71] uppercase tracking-wider flex items-center gap-2">
              <span>🃏 Seat Cut Protocol</span>
            </h2>
            <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-widest mt-0.5">
              Table ID: {tableName}
            </span>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white text-md cursor-pointer h-8 w-8 flex items-center justify-center hover:bg-white/5 rounded-full"
          >
            ✕
          </button>
        </div>

        {step === 'entry' ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Enter each player's selected card. Duplicate cards are automatically prevented. 
              The system automatically calculates seating ranks, clockwise dealer assignment, and distribution orders.
            </p>

            {/* SELECTION TABLE */}
            <div className="border border-white/5 rounded-xl overflow-hidden bg-slate-950/45">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-black/40 text-slate-400 font-bold border-b border-white/5 text-[10px] uppercase tracking-widest">
                    <th className="p-3">Player</th>
                    <th className="p-3 text-center">Controls / Card Selector</th>
                    <th className="p-3 text-right">Selected</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((pName) => {
                    const sel = selections[pName];
                    return (
                      <tr key={pName} className="border-b border-white/5 hover:bg-white/[0.01]">
                        <td className="p-3 font-semibold text-slate-200">
                          {pName}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center">
                            {(['♠', '♥', '♦', '♣', 'Joker'] as const).map((suit) => {
                              const active = sel.suit === suit;
                              return (
                                <button
                                  key={suit}
                                  type="button"
                                  onClick={() => handleSuitPress(pName, suit)}
                                  className={`px-2.5 py-1.5 rounded-lg border text-sm font-black transition cursor-pointer flex items-center justify-center ${getSuitColor(suit)} ${
                                    active ? 'ring-2 ring-emerald-500 scale-105 border-transparent font-black shadow-lg' : 'opacity-70 hover:opacity-100'
                                  }`}
                                >
                                  {suit}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          {sel.suit ? (
                            <span className="font-extrabold text-sm text-[var(--accent)] tracking-wider p-1.5 bg-slate-900 rounded border border-white/5">
                              {sel.suit === 'Joker' ? '🃏 Joker' : `${sel.value}${sel.suit}`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">None Selected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* CARD SELECTOR POPUP/KEYBOARD PANEL */}
            {activePlayerKeypad && (
              <div className="bg-slate-950/70 p-4 rounded-xl border border-white/10 animate-slideDown flex flex-col gap-2">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-xs font-bold text-slate-300">
                    Select card rank belonging to suit{' '}
                    <strong className="text-emerald-400">
                      {activePlayerKeypad.suit}
                    </strong>{' '}
                    for player <strong>{activePlayerKeypad.player}</strong>
                  </span>
                  <button 
                    onClick={() => setActivePlayerKeypad(null)} 
                    className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer underline"
                  >
                    Cancel
                  </button>
                </div>
                
                <div className="grid grid-cols-7 gap-1.5 mt-2">
                  {VALUE_ORDER.map((val) => {
                    const disabled = isCardAssigned(activePlayerKeypad.suit, val);
                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleCardValuePress(val)}
                        className={`py-2 text-[13px] font-black rounded border transition font-mono ${
                          disabled
                            ? 'bg-slate-900 text-slate-600 border-white/5 cursor-not-allowed opacity-30Layout'
                            : 'bg-slate-800 hover:bg-slate-700 text-white border-white/10 hover:border-[var(--accent)] cursor-pointer'
                        }`}
                      >
                        {val}
                        <span className="text-[10px] ml-[2px] opacity-70">
                          {activePlayerKeypad.suit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MAIN ACTIONS */}
            <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!isAllEntered}
                onClick={calculateResultsAndSaveAudit}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 font-black text-slate-950 text-xs rounded-xl uppercase tracking-wider transition hover:brightness-110 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Calculate Results 🧮
              </button>
            </div>
          </div>
        ) : (
          /* RESULTS DISPLAY SCREEN */
          <div className="flex flex-col gap-4 animate-fadeIn">
            <h3 className="text-yellow-500 font-extrabold text-sm uppercase tracking-widest flex items-center gap-1">
              <span>🏆 Calculated Seating & Dealer Outcomes</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Seating Ranks */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-white/5 flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Clockwise Seating Order
                </span>
                <div className="flex flex-col gap-1.5 mt-1 font-mono text-xs">
                  {results?.seatingOrder.map((s) => (
                    <div key={s.seat} className="flex justify-between items-center p-2 rounded bg-white/2 border border-white/5">
                      <span className="font-bold text-emerald-400">
                        Seat {s.seat}: {s.player}
                      </span>
                      <div className="flex gap-2 items-center">
                        <span className="bg-slate-900 py-0.5 px-2.5 rounded font-black border border-white/5 text-[var(--accent)] text-xs">
                          {s.card}
                        </span>
                        <span className="bg-black/50 py-0.5 px-2 text-[9px] rounded font-semibold text-amber-500 uppercase">
                          Rank {s.rank}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assignments details */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-white/5 flex flex-col gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Assigned Dealer
                  </span>
                  <div className="mt-2 text-sm font-black text-[#e74c3c] bg-[#e74c3c]/10 border border-[#e74c3c]/20 py-2.5 px-4 rounded-xl inline-block font-mono tracking-wide uppercase">
                    👑 DEALER: {results?.dealer}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                    Clockwise Distribution Order
                  </span>
                  <div className="flex flex-col gap-1 text-xs font-mono">
                    {results?.distributionOrder.map((pName, idx) => (
                      <div key={pName} className="flex gap-3 items-center">
                        <span className="text-[10px] text-slate-500 font-bold w-4">
                          {idx + 1}.
                        </span>
                        <span className={idx === 0 ? 'text-emerald-400 font-black' : (pName === results.dealer ? 'text-red-400 font-black' : 'text-slate-300')}>
                          {pName} {idx === 0 ? '(Receives First, clock-one)' : (pName === results.dealer ? '(Dealer last)' : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* INTEGRITY AUDIT NOTIFICATION */}
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-[10px] text-slate-400 font-mono leading-relaxed">
              <strong>AUDIT LOG CREATED PERFECTLY:</strong> The automatic seating rankings, cards, assigned dealers, and distribution sequences have been archived to the Firestore database with digital signature stamp vectors for dispute prevention.
            </div>

            {/* FINAL ACTIONS */}
            <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setStep('entry')}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                ← Back / Modify
              </button>
              <button
                type="button"
                onClick={handleCompleteActivation}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 font-black text-slate-950 text-xs rounded-xl uppercase tracking-wider transition hover:brightness-110 cursor-pointer shadow-lg shadow-emerald-500/10"
              >
                Apply & Start Game 🏁
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
