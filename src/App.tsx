import React, { useState, useEffect } from 'react';
import { GameState, Player } from './types';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Login } from './screens/Login';
import { ActiveGame } from './screens/ActiveGame';
import { ProfileModal } from './components/ProfileModal';
import { getExitLimitFor, getPlayerReEntriesCount, formatEliteDate } from './game/gameLogic';
import jsPDF from 'jspdf';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Firestore models
  const [playersDb, setPlayersDb] = useState<Player[]>([]);
  const [savedGames, setSavedGames] = useState<GameState[]>([]);

  // Routing navigation
  const [currentScreen, setCurrentScreen] = useState<'newGame' | 'continue' | 'stats' | 'history'>('newGame');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  // Modals state
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // New Game values
  const [gName, setGName] = useState('');
  const [rulesetMode, setRulesetMode] = useState<'standard' | 'custom' | 'tournament'>('standard');
  const [exitScoreInput, setExitScoreInput] = useState('241');
  const [maxReentriesInput, setMaxReentriesInput] = useState('1');
  const [selectedGameAdmin, setSelectedGameAdmin] = useState('');
  const [newGamePlayers, setNewGamePlayers] = useState<string[]>(['', '']); // Initial 2 empty selects

  // Track Auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Sync real-time directory snapshots
  useEffect(() => {
    if (!currentUser) return;

    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      const list: Player[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Player);
      });
      setPlayersDb(list);
    });

    const unsubGames = onSnapshot(collection(db, 'eliteGames'), (snap) => {
      const list: GameState[] = [];
      snap.forEach(d => {
        list.push(d.data() as GameState);
      });
      setSavedGames(list);
    });

    return () => {
      unsubPlayers();
      unsubGames();
    };
  }, [currentUser]);

  // Handle URL Hash persistence
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.substring(1);
      if (hash.startsWith('activeGame:')) {
        const id = hash.split(':')[1];
        setActiveGameId(id);
      } else if (['newGame', 'continue', 'stats', 'history'].includes(hash)) {
        setCurrentScreen(hash as any);
      }
    };
    window.addEventListener('hashchange', handleHash);
    handleHash(); // Run onmount
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#111d27] text-white">
        <div className="relative w-12 h-12">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-emerald-500/20 rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-emerald-500 border-t-transparent animate-spin rounded-full"></div>
        </div>
        <p className="mt-4 text-xs font-mono font-bold text-slate-400 uppercase tracking-widest animate-pulse">
          Starting Engine...
        </p>
      </div>
    );
  }

  // Render Login flow if unauthenticated
  if (!currentUser) {
    return <Login players={playersDb} />;
  }

  const handleLogout = async () => {
    try {
      if (auth.currentUser) {
        // Update player online status nicely on exit
        const userRef = doc(db, 'players', auth.currentUser.uid);
        await updateDoc(userRef, { isOnline: false });
      }
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  const getProfileName = (id: string) => {
    const p = playersDb.find(x => x.id === id);
    return p ? p.fullName : 'Elite Player';
  };

  const activeGameSession = savedGames.find(g => g.id === activeGameId && !g.isDeleted && !g.isAborted);

  // Router override: Active game screen takes full precedence
  if (activeGameSession) {
    return (
      <div className="min-h-screen bg-[#111d27] text-slate-100 flex flex-col justify-between">
        <ActiveGame 
          gameState={activeGameSession} 
          playersDb={playersDb} 
          onExit={() => {
            setActiveGameId(null);
            window.location.hash = currentScreen;
          }} 
        />
        <footer className="py-4 text-center select-none text-[10px] opacity-40 hover:opacity-100 transition duration-300">
          <span 
            onClick={() => setIsReleaseNotesOpen(true)}
            className="underline text-[var(--accent)] hover:text-emerald-400 font-bold cursor-pointer"
          >
            v103.0
          </span>
          <div className="text-[10px] mt-1 text-slate-400 font-mono">Developer: Elite IT</div>
        </footer>
        {isReleaseNotesOpen && renderReleaseNotesModal()}
      </div>
    );
  }

  // HTML UI Generators for Screens
  const insertDateTimeInName = () => {
    const dateStr = formatEliteDate(new Date());
    setGName(prev => {
      const base = prev.split(' ')[0] || prev || 'Game';
      return `${base} ${dateStr}`;
    });
  };

  // Fisher-Yates shuffle algorithm style
  const startGame = async () => {
    const roster = newGamePlayers.filter(v => v !== '');
    if (roster.length < 2) {
      alert("Please select at least 2 players!");
      return;
    }

    const shuffled = [...roster];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const limit = rulesetMode === 'custom' ? parseInt(exitScoreInput) : 241;
    const maxRE = rulesetMode === 'custom' ? parseInt(maxReentriesInput) : (rulesetMode === 'tournament' ? 0 : 1);

    if (isNaN(limit) || limit <= 0) {
      alert("Please enter a valid exit score limit greater than 0.");
      return;
    }
    if (isNaN(maxRE) || maxRE < 0) {
      alert("Please enter a valid number of re-entries allowed (min 0).");
      return;
    }

    const gameAdminName = selectedGameAdmin || getProfileName(currentUser.uid) || shuffled[0];

    const newGameId = Date.now().toString();
    const totals: { [p: string]: number } = {};
    const eliminated: { [p: string]: boolean } = {};
    const reEntries: { [p: string]: number } = {};
    const roundScores: { [p: string]: any } = {};
    const roundTactics: { [p: string]: any } = {};
    const lastDropRound: { [p: string]: number } = {};
    const actionStats: { [p: string]: any } = {};

    shuffled.forEach(p => {
      totals[p] = 0;
      eliminated[p] = false;
      reEntries[p] = 0;
      roundScores[p] = null;
      roundTactics[p] = null;
      lastDropRound[p] = -1;
      actionStats[p] = { shows: 0, fcs: 0, drops: 0, mds: 0 };
    });

    const initGameState: GameState = {
      id: newGameId,
      name: gName.trim() || `Tournament ${formatEliteDate(new Date())}`,
      startTime: formatEliteDate(new Date()),
      players: shuffled,
      startingPlayers: shuffled,
      totals,
      roundScores,
      roundTactics,
      lastDropRound,
      eliminated,
      reEntries,
      actionStats,
      round: 1,
      history: [],
      winner: null,
      endTime: null,
      ruleset: rulesetMode,
      exitScoreLimit: limit,
      maxReEntries: maxRE,
      admin: gameAdminName,
      lastActivity: Date.now()
    };

    try {
      const docRef = doc(db, 'eliteGames', newGameId);
      await setDoc(docRef, initGameState);
      
      // Update local and redirect
      setActiveGameId(newGameId);
      window.location.hash = `activeGame:${newGameId}`;
    } catch (err) {
      console.error('Failed to initialize game:', err);
      alert('Failed to boot tournament state.');
    }
  };

  const deleteOngoingGame = async (id: string) => {
    if (!window.confirm("Are you sure you want to completely delete this game? This action is irreversible.")) return;
    try {
      await deleteDoc(doc(db, 'eliteGames', id));
    } catch (err) {
      console.error(err);
    }
  };

  const abortOngoingGame = async (id: string) => {
    if (!window.confirm("Abort this game? This will preserve it in history as aborted, but lock updates.")) return;
    try {
      await updateDoc(doc(db, 'eliteGames', id), { isAborted: true, endTime: formatEliteDate(new Date()) });
    } catch (err) {
      console.error(err);
    }
  };

  // Elegant PDF Certificate download directly using jsPDF Coordinates
  const downloadAwardCertificate = (g: GameState) => {
    if (!g.winner) return;

    try {
      const docPdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const winnerName = g.winner.toUpperCase();
      const gameName = g.name || "Elite Game";
      const dateStr = g.endTime || g.startTime || formatEliteDate(new Date());

      // Royal parchment background
      docPdf.setFillColor(252, 250, 242);
      docPdf.rect(0, 0, 297, 210, 'F');

      // Subtle Watermark
      docPdf.setTextColor(242, 240, 230);
      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(100);
      docPdf.text("ELITE", 148.5, 115, { align: "center" });

      // Golden outer borders
      docPdf.setDrawColor(165, 124, 0); 
      docPdf.setLineWidth(4);
      docPdf.rect(8, 8, 281, 194);

      // Charcoal dual borders
      docPdf.setDrawColor(30, 30, 30);
      docPdf.setLineWidth(0.5);
      docPdf.rect(13, 13, 271, 184);
      docPdf.rect(15, 15, 267, 180);

      // Header Banner
      docPdf.setTextColor(20, 20, 20);
      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(38);
      docPdf.text("CERTIFICATE OF TRIUMPH", 148.5, 52, { align: "center" });

      docPdf.setTextColor(165, 124, 0);
      docPdf.setFontSize(16);
      docPdf.text("ELITE RUMMY CIRCLE CHAMPIONSHIP", 148.5, 63, { align: "center" });

      // Decorative Bar
      docPdf.setDrawColor(165, 124, 0);
      docPdf.setLineWidth(0.8);
      docPdf.line(90, 70, 207, 70);

      // Award description
      docPdf.setTextColor(70, 70, 70);
      docPdf.setFont("helvetica", "italic");
      docPdf.setFontSize(18);
      docPdf.text("This official commendation is awarded to", 148.5, 90, { align: "center" });

      // Large Centerpiece Name
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(44);
      docPdf.setFont("helvetica", "bold");
      docPdf.text(winnerName, 148.5, 112, { align: "center" });

      // Name underlines
      docPdf.setDrawColor(0, 0, 0);
      docPdf.setLineWidth(1.0);
      docPdf.line(50, 118, 247, 118);

      // Achievement sentences
      docPdf.setTextColor(50, 50, 50);
      docPdf.setFontSize(14);
      docPdf.setFont("helvetica", "normal");
      docPdf.text(`for emerging victorious in the game of "${gameName}"`, 148.5, 136, { align: "center" });
      docPdf.text(`demonstrating exceptional mental discipline and tactical excellence.`, 148.5, 145, { align: "center" });

      // Signatures
      docPdf.setFontSize(12);
      docPdf.setTextColor(30, 30, 30);

      // Left column award date
      docPdf.text(dateStr, 75, 175, { align: "center" });
      docPdf.setDrawColor(100, 100, 100);
      docPdf.setLineWidth(0.5);
      docPdf.line(45, 170, 105, 170);
      docPdf.setFontSize(10);
      docPdf.setFont("helvetica", "bold");
      docPdf.text("AWARD DATE", 75, 180, { align: "center" });

      // Right column signature
      docPdf.setFontSize(12);
      docPdf.text("S. A. R.", 222, 175, { align: "center" });
      docPdf.line(192, 170, 252, 170);
      docPdf.setFontSize(10);
      docPdf.text("ELITE RUMMY COMMISSIONER", 222, 180, { align: "center" });

      // Stamp Seal
      docPdf.setFillColor(31, 58, 147); 
      docPdf.circle(255, 40, 16, 'F');
      docPdf.setDrawColor(165, 124, 0);
      docPdf.setLineWidth(1.0);
      docPdf.circle(255, 40, 14);

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(8);
      docPdf.text("AUTHENTIC", 255, 37, { align: "center" });
      docPdf.text("ELITE", 255, 41, { align: "center" });
      docPdf.text("WINNER", 255, 45, { align: "center" });

      const safeName = winnerName.replace(/[^a-z0-9]/gi, '_');
      docPdf.save(`Elite_Certificate_${safeName}.pdf`);
    } catch (e) {
      console.error(err => console.log('PDF print fail:', err));
      alert("Error generating winner's award certificate.");
    }
  };

  function renderReleaseNotesModal() {
    return (
      <div className="modal-overlay flex items-center justify-center fixed inset-0 z-[9900] bg-black/85 backdrop-blur-md p-4">
        <div className="modal-card bg-[#1a252f] w-full max-w-sm p-6 rounded-2xl border border-white/5 shadow-2xl text-left text-slate-200">
          <h3 className="text-md font-extrabold text-[#2ecc71] border-b border-white/10 pb-3 mb-4 uppercase tracking-widest">
            Release Notes
          </h3>
          
          <div className="max-h-72 overflow-y-auto pr-1 flex flex-col gap-4 text-xs">
            <div>
              <b className="text-yellow-500 block mb-1">v103.0 - Robust Google Auth Integration & Logo Aesthetics</b>
              <p className="opacity-80 leading-relaxed font-sans pb-1">
                • <b>Robust Google Authentication (signInWithRedirect):</b> Upgraded Google Sign-In with a persistent redirections flow (<code>signInWithRedirect</code> and <code>getRedirectResult</code>) in place of popups. This completely resolves mobile browser popup blocks, private/incognito mode constraints, and Safari's cross-site tracking blockades for the production live environment.<br />
                • <b>Firebase Analytics Synchronization:</b> Connected the official Firebase <code>measurementId</code> directly to the initialized app context configuration, perfecting cross-platform traffic verification.<br />
                • <b>Clean Tactical UI:</b> Removed the excessive scroll emoji (<code>📜</code>) from the active seat cut log operations action button to establish a smoother, distraction-free aesthetic layout.
              </p>
            </div>

            <hr className="opacity-10" />

            <div>
              <b className="text-yellow-500 block mb-1">v102.2 - Score Overrides & Elite Ruleset Cutoff</b>
              <p className="opacity-80 leading-relaxed font-sans pb-1">
                • <b>Elite Ruleset Cutoff:</b> Updated Elite ruleset exit standard to &gt;241 points from the previous 240.<br />
                • <b>Score Edit Auto-Deactivation:</b> Manually editing scores now automatically deactivates active Tactic highlights (S, D, MD, FC, FS) to prevent status discrepancies in historical round sheets and active rounds. Clicking an active Tactic button again cleanly toggles it off.
              </p>
            </div>

            <hr className="opacity-10" />

            <div>
              <b className="text-yellow-500 block mb-1">v102.1 - Core Engine Refinements</b>
              <p className="opacity-80 leading-relaxed font-sans">
                Engine Update: Fixed mid-game dealer rotation, improved manual score editing overrides, and applied optimistic UI rendering for instantaneous round transitions.
              </p>
            </div>
            
            <hr className="opacity-10" />

            <div>
              <b className="text-yellow-500 block mb-1">v91.6 - Custom Tactic Separation & Keyboard Decoupling</b>
              <p className="opacity-80 leading-relaxed font-sans">
                • <b>Manual Entry Separation:</b> Manually entered scores (like 20 or 40 points) on the keyboard/keypad no longer auto-click or highlight the Drop (D) or Middle Drop (MD) buttons.<br />
                • <b>Explicit Drop Rule:</b> The strict Drop consecutive round lockout rule (D rule) is preserved exclusively for players who clicked-to-drop, avoiding accidental application for raw keyboard inputs.<br />
                • <b>Intelligent Active States:</b> Updated UI button status rendering to require explicit tactic identifiers, ensuring clean layout coherence during real-time database updates.
              </p>
            </div>
            
            <hr className="opacity-10" />

            <div>
              <b className="text-yellow-500 block mb-1">v91.5 - Pixel-Perfect Header Alignments & Fit-to-Screen Formula</b>
              <p className="opacity-80 leading-relaxed font-sans">
                • <b>Mathematical Zero-Overflow Fitting:</b> Perfected a spacing-aware mathematical height algorithm that includes browser cell spacing directly in equations to accurately fit any number of players to the TV screen without vertical cut-offs.<br />
                • <b>Pixel-Perfect Alignments:</b> Left-aligned column headers perfectly match player avatars and text indentation coordinates, correcting legacy overflow issues.
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={() => setIsReleaseNotesOpen(false)}
            className="w-full mt-5 bg-slate-800 hover:bg-slate-700 text-slate-100 py-2 rounded font-semibold cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111d27] text-slate-100 flex flex-col md:flex-row pb-10 md:pb-0">
      {/* SIDEBAR NAVIGATION PANEL */}
      <aside className="w-full md:w-64 bg-[#16222f] p-5 flex flex-col md:min-h-screen border-b md:border-b-0 md:border-r border-white/5 flex-shrink-0">
        <div className="flex justify-between items-center md:flex-col md:items-start md:gap-8 mb-5 md:mb-8">
          <div className="flex flex-col">
            <h2 className="text-lg font-black bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent uppercase tracking-wider">
              Elite Circle
            </h2>
            <span className="text-[10px] opacity-40 uppercase tracking-widest font-mono">Tournament Hub</span>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300 font-mono">
              Online: {playersDb.filter(x => x.isOnline).length}
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-none flex-1">
          <button 
            onClick={() => { setCurrentScreen('newGame'); window.location.hash = 'newGame'; }}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${currentScreen === 'newGame' ? 'bg-[#2ecc71]/10 text-[#2ecc71] border border-[#2ecc71]/20 shadow-lg shadow-emerald-500/5' : 'hover:bg-white/3 text-slate-400'}`}
          >
            New Game
          </button>
          <button 
            onClick={() => { setCurrentScreen('continue'); window.location.hash = 'continue'; }}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${currentScreen === 'continue' ? 'bg-[#2ecc71]/10 text-[#2ecc71] border border-[#2ecc71]/20' : 'hover:bg-white/3 text-slate-400'}`}
          >
            Active Matches ({savedGames.filter(g => !g.winner && !g.isDeleted && !g.isAborted).length})
          </button>
          <button 
            onClick={() => { setCurrentScreen('stats'); window.location.hash = 'stats'; }}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${currentScreen === 'stats' ? 'bg-[#2ecc71]/10 text-[#2ecc71] border border-[#2ecc71]/20' : 'hover:bg-white/3 text-slate-400'}`}
          >
            Hall of Fame
          </button>
          <button 
            onClick={() => { setCurrentScreen('history'); window.location.hash = 'history'; }}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${currentScreen === 'history' ? 'bg-[#2ecc71]/10 text-[#2ecc71] border border-[#2ecc71]/20' : 'hover:bg-white/3 text-slate-400'}`}
          >
            History & Records
          </button>

          <button 
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold bg-[#e74c3c]/10 text-[#e74c3c] hover:bg-[#e74c3c]/20 transition mt-auto hidden md:block cursor-pointer border border-[#e74c3c]/10"
          >
            Logout
          </button>
        </nav>
      </aside>

      {/* MAIN DYNAMIC CONTENT BOX */}
      <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full">
        {currentScreen === 'newGame' && (
          <div className="flex flex-col gap-4 animate-fadeIn">
            <h2 className="text-xl font-black text-slate-100 tracking-tight uppercase">New Game Setup</h2>
            <div className="bg-[#16222f] p-5 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-xl">
              
              <div className="flex flex-col gap-1.5">
                <input 
                  type="text" 
                  className="std-input text-md font-semibold bg-slate-900 border-white/10 text-white rounded-xl focus:border-[var(--accent)]" 
                  placeholder="Enter Tournament / Game Name" 
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                />
                <button 
                  onClick={insertDateTimeInName}
                  className="bg-[#2ecc71]/10 hover:bg-[#2ecc71]/20 text-[#2ecc71] py-1.5 text-[10px] font-black uppercase tracking-wider rounded border border-[#2ecc71]/20 mt-0.5 cursor-pointer max-w-[170px] self-start px-3"
                >
                  🕒 Insert date-time
                </button>
              </div>

              {/* Ruleset mode tabs */}
              <div className="border-t border-white/5 pt-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ruleset Preset</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setRulesetMode('standard')}
                    className={`flex-1 py-2 text-xs font-extrabold rounded-lg cursor-pointer transition ${rulesetMode === 'standard' ? 'bg-[var(--accent)] text-white font-extrabold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                    Elite
                  </button>
                  <button 
                    type="button"
                    onClick={() => setRulesetMode('custom')}
                    className={`flex-1 py-2 text-xs font-extrabold rounded-lg cursor-pointer transition ${rulesetMode === 'custom' ? 'bg-orange-600 text-white font-extrabold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                    Custom Rules
                  </button>
                  <button 
                    type="button"
                    onClick={() => setRulesetMode('tournament')}
                    className={`flex-1 py-2 text-xs font-extrabold rounded-lg cursor-pointer transition ${rulesetMode === 'tournament' ? 'bg-purple-600 text-white font-extrabold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                    Tournament
                  </button>
                </div>
              </div>

              {rulesetMode === 'tournament' && (
                <div className="bg-purple-950/20 p-4 border border-purple-500/20 rounded-xl flex flex-col gap-1.5 animate-slideDown text-[11px] text-purple-300">
                  <strong className="text-yellow-500 text-xs">🏁 CHAMPIONSHIP MODE PROTOCOL</strong>
                  <p>• Mandatory Seat Cut to automate seating order, dealer, and clockwise distribution sequences.</p>
                  <p>• Strictly <strong className="text-[#e74c3c]">NO RE-ENTRY</strong>. Standard cutoff is &gt;241.</p>
                </div>
              )}

              {rulesetMode === 'custom' && (
                <div className="bg-black/20 p-4 border border-white/5 rounded-xl flex flex-col gap-3 animate-slideDown text-xs text-slate-300">
                  <div className="flex flex-col gap-1">
                    <label className="font-semibold text-[11px] text-slate-400">Exit Score limit (Total points to eliminate a player):</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="std-input bg-slate-900 border-white/10 text-white rounded focus:border-orange-500 text-xs h-9 px-3"
                      value={exitScoreInput}
                      onChange={(e) => setExitScoreInput(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-semibold text-[11px] text-slate-400">Max Re-entries authorized per player:</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="std-input bg-slate-900 border-white/10 text-white rounded focus:border-orange-500 text-xs h-9 px-3"
                      value={maxReentriesInput}
                      onChange={(e) => setMaxReentriesInput(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Roster setup selection */}
              <div className="border-t border-white/5 pt-4">
                <label className="block text-[10px] font-bold text-[#e74c3c] uppercase tracking-widest mb-3">Player Lineup / Seats</label>
                
                <div className="flex flex-col gap-2">
                  {newGamePlayers.map((playerSelected, idx) => {
                    // Extract directory candidates who are not already selected on other slots
                    const otherSelected = newGamePlayers.filter((p, sIdx) => sIdx !== idx && p !== '');
                    const availablePlayers = playersDb.filter(candidate => !otherSelected.includes(candidate.fullName));

                    return (
                      <div key={idx} className="flex gap-2 items-center">
                        <select 
                          className="std-input bg-slate-900 border-white/10 text-slate-100 rounded-xl text-xs h-9 flex-1 px-3 focus:outline-none focus:border-[var(--accent)]"
                          value={playerSelected}
                          onChange={(e) => {
                            const next = [...newGamePlayers];
                            next[idx] = e.target.value;
                            setNewGamePlayers(next);
                          }}
                        >
                          <option value="">-- Select Seat Player --</option>
                          {availablePlayers.map(p => (
                            <option key={p.id} value={p.fullName}>{p.fullName} {p.isOnline ? '●' : '(OFFLINE)'}</option>
                          ))}
                        </select>
                        
                        <button 
                          onClick={() => {
                            const next = newGamePlayers.filter((_, sIdx) => sIdx !== idx);
                            setNewGamePlayers(next);
                          }}
                          className="bg-red-500/10 hover:bg-red-500/20 text-[#e74c3c] h-9 w-9 flex items-center justify-center rounded border border-red-500/20 cursor-pointer text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button 
                  onClick={() => setNewGamePlayers([...newGamePlayers, ''])}
                  className="w-full mt-3 py-2 text-xs font-semibold bg-white/3 hover:bg-white/5 rounded border border-dashed border-white/10 transition cursor-pointer"
                >
                  + Add Player Seat
                </button>
              </div>

              {/* Authorize Admin Selector */}
              <div className="border-t border-white/5 pt-4 flex flex-col gap-1.5">
                <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                  Authorize Game Admin
                </label>
                <select 
                  className="std-input bg-slate-900 border-white/10 text-slate-100 rounded-xl text-xs h-9 px-3 focus:outline-none focus:border-[var(--accent)]"
                  value={selectedGameAdmin}
                  onChange={(e) => setSelectedGameAdmin(e.target.value)}
                >
                  <option value="">-- Select Game Admin --</option>
                  {newGamePlayers.filter(p => p !== '').map(pName => (
                    <option key={pName} value={pName}>{pName}</option>
                  ))}
                </select>
                <span className="text-[9px] opacity-40 font-mono mt-0.5 leading-normal">
                  The Admin has the sole authority to rename games and correct scores for ended rounds.
                </span>
              </div>

              <button 
                onClick={startGame}
                className="w-full mt-2 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 rounded-xl font-bold text-xs uppercase text-slate-900 tracking-wider shadow-lg shadow-emerald-500/10 cursor-pointer"
              >
                Start Game (with Seat Cut)
              </button>
            </div>
          </div>
        )}

        {currentScreen === 'continue' && (
          <div className="flex flex-col gap-4 animate-fadeIn">
            <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">Active Ongoing Matches</h2>
            
            {savedGames.filter(g => !g.winner && !g.isDeleted && !g.isAborted).length === 0 ? (
              <div className="bg-[#16222f] p-8 border border-white/5 rounded-2xl text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                No active ongoing tournaments. Create a setup above!
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {savedGames.filter(g => !g.winner && !g.isDeleted && !g.isAborted).map(g => (
                  <div key={g.id} className="bg-[#16222f] p-4 rounded-xl border border-white/5 hover:border-white/10 transition flex justify-between items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <h4 className="font-bold text-xs text-slate-100 tracking-wide uppercase">{g.name}</h4>
                      <p className="text-[10px] opacity-60 mt-1 font-mono uppercase tracking-wider">
                        R-{g.round} • Admin: {g.admin || 'System'} • Players: {g.players?.join(', ')}
                      </p>
                    </div>

                    <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => deleteOngoingGame(g.id)}
                        className="bg-red-500/10 hover:bg-[#e74c3c] text-[#e74c3c] hover:text-white px-2 py-1 text-[10px] rounded font-black border border-red-500/10 cursor-pointer transition uppercase"
                      >
                        Delete
                      </button>
                      <button 
                        onClick={() => abortOngoingGame(g.id)}
                        className="bg-yellow-500/10 hover:bg-yellow-500 text-yellow-500 hover:text-black px-2 py-1 text-[10px] rounded font-extrabold border border-yellow-500/10 cursor-pointer transition uppercase"
                      >
                        Abort
                      </button>
                      <button 
                        onClick={() => {
                          setActiveGameId(g.id);
                          window.location.hash = `activeGame:${g.id}`;
                        }}
                        className="bg-[var(--accent)] hover:bg-emerald-500 text-slate-900 font-extrabold px-3 py-1.5 text-xs rounded transition cursor-pointer"
                      >
                        Resume Game
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentScreen === 'stats' && (
          <div className="flex flex-col gap-4 animate-fadeIn">
            <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">Hall of Fame</h2>
            
            <div className="bg-[#16222f] rounded-2xl border border-white/5 overflow-x-auto shadow-2xl">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 font-black tracking-widest bg-black/20 uppercase text-[9px]">
                    <th className="p-3">Player Name</th>
                    <th className="p-3 text-center">Wins</th>
                    <th className="p-3 text-center">Shows</th>
                    <th className="p-3 text-center">Full C</th>
                    <th className="p-3 text-center">Drop</th>
                    <th className="p-3 text-center">Middle D</th>
                    <th className="p-3 text-center">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {playersDb.map(p => {
                    const name = p.fullName;
                    const finishedGames = savedGames.filter(g => g.winner && g.players?.includes(name) && !g.isAborted && !g.isDeleted);
                    const winCount = finishedGames.filter(g => g.winner === name).length;

                    let s = 0, fc = 0, d = 0, md = 0;
                    finishedGames.forEach(g => {
                      if (g.actionStats?.[name]) {
                        s += g.actionStats[name].shows || 0;
                        fc += g.actionStats[name].fcs || 0;
                        d += g.actionStats[name].drops || 0;
                        md += g.actionStats[name].mds || 0;
                      }
                    });

                    const winRate = finishedGames.length > 0 ? ((winCount / finishedGames.length) * 100).toFixed(0) : '0';

                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setSelectedProfileId(p.id)}
                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-semibold text-slate-100 flex items-center gap-2">
                          <img 
                            src={p.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=27ae60&color=fff&size=80`} 
                            alt="" 
                            className="w-5 h-5 rounded-full object-cover border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                          <span>{name}</span>
                        </td>
                        <td className="p-3 text-center font-bold text-yellow-500">{winCount}</td>
                        <td className="p-3 text-center font-bold text-emerald-400">{s}</td>
                        <td className="p-3 text-center font-bold text-red-500">{fc}</td>
                        <td className="p-3 text-center font-bold text-yellow-500">{d}</td>
                        <td className="p-3 text-center font-bold text-purple-400">{md}</td>
                        <td className="p-3 text-center opacity-60">{winRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentScreen === 'history' && (
          <div className="flex flex-col gap-4 animate-fadeIn">
            <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">Records & Completed Tournaments</h2>

            {savedGames.filter(g => g.winner || g.isAborted).length === 0 ? (
              <div className="bg-[#16222f] p-8 border border-white/5 rounded-2xl text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                No archived games in server database yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {savedGames.filter(g => g.winner || g.isAborted).map(g => (
                  <div key={g.id} className="bg-[#16222f] p-4 rounded-xl border border-white/5 hover:border-white/10 transition flex justify-between items-center gap-4 flex-wrap text-left text-xs">
                    <div className="flex-1 min-w-[200px]">
                      <h4 className="font-bold text-xs text-slate-100 tracking-wide uppercase">{g.name}</h4>
                      <p className="text-[10px] opacity-50 mt-1 font-mono uppercase tracking-wider">
                        Archive Date: {g.endTime || g.startTime} • Participants: {g.players?.join(', ')}
                      </p>
                      {g.isAborted ? (
                        <span className="text-red-500 font-bold text-[9px] uppercase tracking-wider mt-1 inline-block">STATUS: GAME ABORTED</span>
                      ) : (
                        <div className="text-[10px] text-yellow-500 font-semibold mt-1">🏆 Winner: {g.winner}</div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => deleteOngoingGame(g.id)}
                        className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-2 py-1 text-[10px] rounded font-black border border-red-500/10 cursor-pointer transition uppercase"
                      >
                        Delete
                      </button>
                      
                      {g.winner && !g.isAborted && (
                        <button 
                          onClick={() => downloadAwardCertificate(g)}
                          className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-extrabold px-3 py-1.5 text-xs rounded transition cursor-pointer flex items-center gap-1 hover:brightness-115"
                        >
                          Certificate 📜
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER RELEASE BANNER */}
      <footer className="py-4 md:py-6 text-center select-none text-[10px] opacity-40 hover:opacity-100 transition duration-300 md:fixed md:bottom-2 md:left-4 z-[4000]">
        <span 
          onClick={() => setIsReleaseNotesOpen(true)}
          className="underline text-[var(--accent)] hover:text-[#52e28c] font-bold cursor-pointer bg-black/30 px-2 py-1.5 rounded"
        >
          v103.0
        </span>
        <div className="text-[9px] mt-1 text-slate-400 font-mono">Developer: Elite IT</div>
      </footer>

      {/* MODALS RENDER OVERLAYS */}
      {isReleaseNotesOpen && renderReleaseNotesModal()}

      {selectedProfileId && (
        <ProfileModal 
          isOpen={!!selectedProfileId} 
          onClose={() => setSelectedProfileId(null)} 
          userId={selectedProfileId} 
          playersDb={playersDb} 
          savedGames={savedGames} 
        />
      )}
    </div>
  );
}
