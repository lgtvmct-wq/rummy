import React, { useState, useEffect, useRef } from 'react';
import { GameState, Player } from '../types';
import { getExitLimitFor, getPlayerReEntriesCount, getDealerForState } from '../game/gameLogic';
import { jsPDF } from 'jspdf';

interface ScoreboardProps {
  isOpen: boolean;
  onClose: () => void;
  state: GameState | null;
  playersDb: Player[];
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ isOpen, onClose, state, playersDb }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [showRuleset, setShowRuleset] = useState(false);

  const downloadRulesetPDF = () => {
    try {
      const docPdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      docPdf.setFillColor(253, 251, 243); // warm light paper beige
      docPdf.rect(0, 0, 210, 297, 'F');

      // Borders
      docPdf.setDrawColor(165, 124, 0); 
      docPdf.setLineWidth(3);
      docPdf.rect(8, 8, 194, 281);

      docPdf.setDrawColor(33, 47, 61);
      docPdf.setLineWidth(0.5);
      docPdf.rect(11, 11, 188, 275);

      // Header
      docPdf.setTextColor(33, 47, 61);
      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(26);
      docPdf.text("THERUMMY.ME TOURNAMENT RULESET", 105, 28, { align: "center" });

      docPdf.setTextColor(165, 124, 0);
      docPdf.setFontSize(13);
      docPdf.text("OFFICIAL SEAT CUT & CHAMPIONSHIP MANUAL", 105, 36, { align: "center" });

      docPdf.setDrawColor(165, 124, 0);
      docPdf.setLineWidth(0.5);
      docPdf.line(40, 41, 170, 41);

      // Body text
      docPdf.setTextColor(30, 30, 30);
      docPdf.setFontSize(10.5);
      docPdf.setFont("helvetica", "normal");

      let yPos = 52;
      const addSection = (title: string, bulletPoints: string[]) => {
        docPdf.setFont("helvetica", "bold");
        docPdf.setTextColor(165, 124, 0);
        docPdf.setFontSize(11);
        docPdf.text(title.toUpperCase(), 18, yPos);
        yPos += 5.5;

        docPdf.setFont("helvetica", "normal");
        docPdf.setTextColor(30, 30, 30);
        docPdf.setFontSize(9.5);
        bulletPoints.forEach(bullet => {
          // Wrap text if needed
          const lines = docPdf.splitTextToSize(bullet, 170);
          lines.forEach((line: string) => {
            docPdf.text(line, 22, yPos);
            yPos += 4.5;
          });
        });
        yPos += 3.5;
      };

      addSection("1. Core Purpose and Intent", [
        "This official ruleset governs the registration, seating protocols, and initial card deal routines for all official Rummy tournaments hosted via therummy.me platform services.",
        "These guidelines ensure fair play, prevent seating/dealer assignment disputes, and automate calculations through standard algebraic priority checks."
      ]);

      addSection("2. Card Ranking Rules", [
        "Card values rank in strict descending alphabetical and numerical priority: Ace (highest) > King > Queen > Jack > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2 > Joker (lowest).",
        "Jokers always rank lower than any valid numerical or pictorial cards (even the 2 of Clubs)."
      ]);

      addSection("3. Suit Ranking & Suit Tie-breakers", [
        "When duplicate card values are picked, suit ranks decide the seating priority.",
        "Suits rank in descending alphabetical standard: Spades (♠) > Hearts (♥) > Diamonds (♦) > Clubs (♣)."
      ]);

      addSection("4. Joker Entry & Multiple Jokers Rule", [
        "Choosing a Joker yields the absolute lowest priority rank.",
        "Any Joker automatically makes the respective player the Dealer unless another Joker is entered.",
        "If multiple Jokers are picker, priority is resolved in strict order of entry timestamps: the earliest entered Joker gets the lowest rank among all."
      ]);

      addSection("5. Seating and Dealer Assignments", [
        "Once card entries are completed, the highest-ranked player chooses Seat Position 1.",
        "Other players are seated clockwise in descending rank order, with the lowest-ranked occupying the last position.",
        "The lowest-ranked player (earliest Joker, if any) is designated the official Dealer of the active table."
      ]);

      addSection("6. Card Distribution Order", [
        "The Dealer shuffles and distributes cards clockwise.",
        "The highest-ranked Seat Cut player receives the first card.",
        "The Dealer (lowest-ranked) receives the final card of the deal rotation."
      ]);

      addSection("7. Tournament Integrity & Audit trail", [
        "For total dispute immunity, calculations are computed entirely on the server side.",
        "Calculated rankings, matching seat assignments, dealer vectors, timestamps, and matching cards are locked to the audit registry database."
      ]);

      // Footer
      docPdf.setTextColor(120, 120, 120);
      docPdf.setFontSize(8.5);
      docPdf.setFont("helvetica", "italic");
      docPdf.text("therummy.me Official Tournament Protocol Manual • System Certified Audit", 105, 283, { align: "center" });

      docPdf.save("therummy_Tournament_Official_Ruleset.pdf");
    } catch (err) {
      console.error(err);
      alert("Failed to download Ruleset PDF. Verify local workspace memory.");
    }
  };

  // Request Wake Lock
  useEffect(() => {
    if (isOpen) {
      const requestWakeLock = async () => {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            console.log('Wake Lock acquired successfully.');
          }
        } catch (err) {
          console.error('Wake Lock acquisition failed:', err);
        }
      };
      requestWakeLock();
    } else {
      const releaseWakeLock = async () => {
        if (wakeLockRef.current) {
          try {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
            console.log('Wake Lock released.');
          } catch (err) {
            console.error('Wake Lock release failed:', err);
          }
        }
      };
      releaseWakeLock();
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((e: any) => console.log(e));
      }
    };
  }, [isOpen]);

  // Celebrity Win animation
  useEffect(() => {
    if (!isOpen || !state?.winner || !canvasRef.current) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localFrameId: number;

    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const colors = [
      '#f1c40f', // Vibrant Gold
      '#ff007f', // Cyber Pink
      '#00f3ff', // Neon Cyan
      '#39ff14', // Electric Green
      '#ff5e00', // Crimson Orange
      '#8e44ad', // Indigo Purple
      '#e74c3c', // Fire Red
      '#ffbe76'  // Sunset Pearl
    ];

    const particles: any[] = [];
    const fireworks: any[] = [];
    const fireworkParticles: any[] = [];

    const startTime = Date.now();
    let lastFireworkTime = 0;

    // Endless cascade
    const confettiCount = 220;
    for (let i = 0; i < confettiCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 1.5 - canvas.height,
        r: Math.random() * 5 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 8 - 4,
        tiltAngleIncremental: Math.random() * 0.05 + 0.03,
        tiltAngle: Math.random() * Math.PI,
        speed: Math.random() * 2.5 + 2.0,
        type: Math.random() > 0.5 ? 'rect' : 'circle'
      });
    }

    // Grand rockets
    for (let i = 0; i < 3; i++) {
      fireworks.push({
        x: canvas.width * (0.18 + i * 0.32) + (Math.random() * 60 - 30),
        y: canvas.height + 15,
        targetY: Math.random() * canvas.height * 0.32 + canvas.height * 0.08,
        speed: Math.random() * 3 + 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: i === 1 ? 'ring' : (i === 2 ? 'crackle' : 'standard')
      });
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(10, 13, 20, 0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      const elapsed = now - startTime;

      // Confetti logic
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += p.speed;
        p.x += Math.sin(p.tiltAngle) * 0.8;

        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
          p.speed = Math.random() * 2.5 + 2.0;
        }

        ctx.save();
        ctx.beginPath();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.tiltAngle);
        ctx.fillStyle = p.color;

        if (p.type === 'rect') {
          ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        } else {
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Rockets
      const interval = Math.max(450, 750 - Math.floor(elapsed / 120));
      if (now - lastFireworkTime > interval) {
        fireworks.push({
          x: Math.random() * canvas.width * 0.74 + canvas.width * 0.13,
          y: canvas.height + 15,
          targetY: Math.random() * canvas.height * 0.40 + canvas.height * 0.08,
          speed: Math.random() * 3.5 + 7.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          type: Math.random() > 0.5 ? 'standard' : (Math.random() > 0.5 ? 'ring' : 'crackle')
        });
        lastFireworkTime = now;
      }

      for (let i = fireworks.length - 1; i >= 0; i--) {
        const f = fireworks[i];
        f.y -= f.speed;

        ctx.beginPath();
        ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 18;
        ctx.shadowColor = f.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (Math.random() < 0.6) {
          fireworkParticles.push({
            x: f.x,
            y: f.y + 4,
            vx: Math.random() * 1.4 - 0.7,
            vy: Math.random() * 1.5 + 1.8,
            color: '#ffdd57',
            alpha: 0.95,
            decay: Math.random() * 0.04 + 0.03,
            gravity: 0.03,
            friction: 0.98,
            glow: 8
          });
        }

        if (f.y <= f.targetY) {
          let sparklesCount = 80;
          let shell = f.type;

          if (shell === 'ring') {
            sparklesCount = 60;
            for (let k = 0; k < sparklesCount; k++) {
              const angle = (k / sparklesCount) * Math.PI * 2;
              const sp = Math.random() * 1.5 + 5.5;
              fireworkParticles.push({
                x: f.x,
                y: f.y,
                vx: Math.cos(angle) * sp,
                vy: Math.sin(angle) * sp,
                color: f.color,
                alpha: 1.0,
                decay: Math.random() * 0.012 + 0.008,
                gravity: 0.05,
                friction: 0.97,
                glow: 15
              });
            }
          } else if (shell === 'crackle') {
            sparklesCount = 95;
            for (let k = 0; k < sparklesCount; k++) {
              const angle = Math.random() * Math.PI * 2;
              const sp = Math.random() * 7.0 + 1.2;
              fireworkParticles.push({
                x: f.x,
                y: f.y,
                vx: Math.cos(angle) * sp,
                vy: Math.sin(angle) * sp,
                color: '#ffdd5Yellow',
                alpha: 1.0,
                decay: Math.random() * 0.024 + 0.015,
                gravity: 0.06,
                friction: 0.96,
                glow: 11,
                isCracker: true
              });
            }
          } else {
            sparklesCount = 100;
            const altColors = colors.filter(c => c !== f.color);
            const secondaryColor = altColors[Math.floor(Math.random() * altColors.length)];
            for (let k = 0; k < sparklesCount; k++) {
              const angle = Math.random() * Math.PI * 2;
              const sp = Math.random() * 8.5 + 1.5;
              fireworkParticles.push({
                x: f.x,
                y: f.y,
                vx: Math.cos(angle) * sp,
                vy: Math.sin(angle) * sp,
                color: Math.random() > 0.4 ? f.color : secondaryColor,
                alpha: 1.0,
                decay: Math.random() * 0.012 + 0.007,
                gravity: 0.045,
                friction: 0.975,
                glow: 18
              });
            }
          }

          fireworks.splice(i, 1);
        }
      }

      for (let j = fireworkParticles.length - 1; j >= 0; j--) {
        const p = fireworkParticles[j];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity || 0.05;
        p.vx *= p.friction || 0.97;
        p.vy *= p.friction || 0.97;
        p.alpha -= p.decay;

        if (p.isCracker && p.alpha > 0.35 && Math.random() < 0.09) {
          fireworkParticles.push({
            x: p.x + (Math.random() * 6 - 3),
            y: p.y + (Math.random() * 6 - 3),
            vx: Math.random() * 2.2 - 1.1,
            vy: Math.random() * 2.2 - 1.1,
            color: '#ffffff',
            alpha: 0.85,
            decay: 0.08,
            gravity: 0.03,
            friction: 0.94,
            glow: 10
          });
        }

        if (p.alpha <= 0) {
          fireworkParticles.splice(j, 1);
        } else {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.isCracker ? 1.5 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
        }
      }

      localFrameId = requestAnimationFrame(animate);
      animationFrameIdRef.current = localFrameId;
    };

    localFrameId = requestAnimationFrame(animate);
    animationFrameIdRef.current = localFrameId;

    return () => {
      cancelAnimationFrame(localFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isOpen, state?.winner]);

  if (!isOpen || !state) return null;

  const isGameOver = !!state.winner;
  const exitLimit = getExitLimitFor(state);

  // Dynamic vertical padding and variables
  const pTop = 2.0;
  const pBottom = 7.0;
  const displayRound = Math.max(0, state.round - 1);
  const playerCount = state.players?.length || 0;

  // Past players
  const past = Object.keys(state.totals || {}).filter(p => !state.players?.includes(p));
  const hasPast = past.length > 0;

  const occupiedHeight = pTop + pBottom + 13.5 + (hasPast ? 4.5 : 0);
  const remainingHeight = 100 - occupiedHeight;

  // Calculate layout Heights to prevent scrollbars
  const headerRowHeightVh = 4.0;
  const spacingFactor = 0.10;
  let rowHeightVh = (remainingHeight - headerRowHeightVh) / (playerCount + (playerCount + 2) * spacingFactor);
  let spacingVh = rowHeightVh * spacingFactor;

  if (rowHeightVh > 12.0) {
    rowHeightVh = 12.0;
    spacingVh = 0.8;
  } else if (rowHeightVh < 1.1) {
    rowHeightVh = 1.1;
    spacingVh = 0.1;
  }

  const tableHeightVh = (rowHeightVh * playerCount) + headerRowHeightVh + (spacingVh * (playerCount + 2));
  const isOverflowing = tableHeightVh > remainingHeight + 0.1;
  const containerAlign = isOverflowing ? 'flex-start' : 'center';
  const tableMargin = isOverflowing ? '0' : 'auto';

  const getTVAvatar = (pName: string) => {
    if (!pName) return 'https://ui-avatars.com/api/?name=Player&background=2c3e50&color=fff&size=200';
    const searchName = pName.trim().toUpperCase();

    // perfect case-insensitive match
    let pData = playersDb.find(x => (x.fullName || '').trim().toUpperCase() === searchName);

    // fallback 1
    if (!pData) {
      pData = playersDb.find(x => {
        const dbName = (x.fullName || '').trim().toUpperCase();
        return dbName && (dbName.includes(searchName) || searchName.includes(dbName));
      });
    }

    // fallback 2
    if (!pData) {
      const searchParts = searchName.split(/\s+/).filter(Boolean);
      pData = playersDb.find(x => {
        const dbName = (x.fullName || '').trim().toUpperCase();
        if (!dbName) return false;
        const dbParts = dbName.split(/\s+/).filter(Boolean);
        return searchParts.some(sp => dbParts.includes(sp));
      });
    }

    if (pData?.photoURL) return pData.photoURL;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=2c3e50&color=fff&size=200`;
  };

  const dealer = getDealerForState(state);

  const sortedPlayersTV = [...(state.players || [])].sort((a, b) => {
    const aOut = state.eliminated?.[a] || (state.totals?.[a] || 0) >= exitLimit;
    const bOut = state.eliminated?.[b] || (state.totals?.[b] || 0) >= exitLimit;
    if (aOut && !bOut) return 1;
    if (!aOut && bOut) return -1;
    if (aOut && bOut) {
      const roster = state.startingPlayers || state.players || [];
      return roster.indexOf(a) - roster.indexOf(b);
    }
    return (state.totals?.[a] || 0) - (state.totals?.[b] || 0);
  });

  return (
    <div 
      className="fixed inset-0 z-[6000] flex flex-col overflow-hidden text-white"
      style={{
        background: '#0a0d14',
        padding: isGameOver ? '0' : `${pTop}vh 3vw ${pBottom}vh 3vw`
      }}
    >
      {/* TV Close and Ruleset Buttons */}
      <div className="absolute top-4 right-4 z-[7000] flex gap-2">
        <button 
          onClick={() => setShowRuleset(true)}
          className="bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold text-xs py-1 px-4 rounded border border-yellow-600 transition cursor-pointer"
        >
          Ruleset 📜
        </button>
        <button 
          onClick={onClose}
          className="bg-slate-800/80 hover:bg-slate-700 hover:text-red-400 text-xs text-white/70 py-1 px-4 rounded border border-white/10 transition cursor-pointer"
        >
          Close Screen
        </button>
      </div>

      {isGameOver ? (
        <div className="relative flex flex-col items-center justify-center h-full w-full text-center overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none w-full h-full z-10" />
          
          <div className="relative z-20 animate-bounce mb-8">
            <div className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black font-extrabold text-[4.5vh] md:text-[6vh] px-12 py-3 rounded-full uppercase tracking-widest shadow-[0_15px_45px_rgba(243,156,18,0.5)] border-4 border-white inline-block">
              🏆 Champion 🏆
            </div>
          </div>

          {state.winner && state.winner !== 'No Winner' && (
            <div className="relative z-20 flex justify-center gap-10 mb-8">
              {state.winner.split('&').map(name => {
                const trimmed = name.trim();
                return (
                  <img 
                    key={trimmed}
                    src={getTVAvatar(trimmed)} 
                    className="w-[24vh] h-[24vh] rounded-full border-4 border-yellow-500 object-cover shadow-[0_0_50px_rgba(241,196,15,0.7)] bg-[#1a252f]"
                    alt={trimmed} 
                    referrerPolicy="no-referrer"
                  />
                );
              })}
            </div>
          )}

          <div className="relative z-20 flex flex-col items-center justify-center">
            <h1 className="text-[6.5vh] md:text-[8.5vh] font-black leading-tight max-w-[90vw] truncate text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
              {state.winner}
            </h1>

            {state.totals[state.winner || ''] !== undefined && (
              <div className="text-[3vh] uppercase tracking-wider text-yellow-500 font-bold flex items-center justify-center gap-4 mt-4">
                <span>Winning Score:</span>
                <span className="text-[5.5vh] font-mono font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                  {state.totals[state.winner || '']}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Esports Arena Header */}
          <div className="flex justify-between items-center border-b-2 border-white/12 pb-3 mb-3 h-[13.5vh] box-border">
            <div className="flex flex-col gap-1 max-w-[70%]">
              <h1 className="text-[4.5vh] md:text-[5.5vh] font-black text-white uppercase tracking-tight truncate leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.25)]">
                {state.name}
              </h1>
              <div className="text-[1.8vh] md:text-[2.0vh] font-semibold text-white/50 uppercase tracking-widest leading-none">
                Elite Rummy Circle Tournament
              </div>
            </div>
            
            <div className="text-right flex flex-col gap-1">
              <span className="text-[4.5vh] md:text-[5.5vh] font-black text-yellow-500 font-mono tracking-tight drop-shadow-[0_0_15px_rgba(241,196,15,0.4)] leading-none">
                ROUND {displayRound}
              </span>
              <div className="flex items-center gap-1.5 text-[1.6vh] md:text-[1.8vh] font-extrabold text-red-500 uppercase tracking-wider justify-end">
                <span className="w-[1.2vh] height-[1.2vh] bg-red-500 rounded-full animate-ping inline-block"></span>
                LIVE
              </div>
            </div>
          </div>

          {/* Leaderboard Table Container */}
          <div 
            className="flex-1 flex flex-col justify-center overflow-hidden" 
            style={{ height: `${remainingHeight}vh`, minHeight: `${remainingHeight}vh` }}
          >
            <table 
              className="w-full border-separate"
              style={{
                height: `${tableHeightVh}vh`,
                tableLayout: 'fixed',
                margin: tableMargin,
                borderSpacing: `0 ${spacingVh}vh`
              }}
            >
              <thead>
                <tr style={{ height: `${headerRowHeightVh}vh` }}>
                  <th className="w-[10%] text-[1.4vh] text-[#fff] opacity-50 uppercase tracking-widest py-0 px-4 text-center font-extrabold border-none">Pos</th>
                  <th className="text-[1.4vh] text-[#fff] opacity-50 uppercase tracking-widest py-0 px-6 text-left font-extrabold border-none">Player</th>
                  <th className="w-[25%] text-[1.4vh] text-[#fff] opacity-50 uppercase tracking-widest py-0 px-6 text-right font-extrabold border-none">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayersTV.map((p, index) => {
                  const isOut = state.eliminated?.[p] || (state.totals?.[p] || 0) >= exitLimit;
                  const score = state.totals?.[p] || 0;

                  let rankWeight = '600';
                  let rowBackground = 'rgba(255,255,255,0.02)';
                  let rowBorderLeft = '6px solid rgba(255,255,255,0.15)';

                  if (!isOut) {
                    if (index === 0) {
                      rankWeight = '900';
                      rowBackground = 'rgba(241,196,15,0.06)';
                      rowBorderLeft = '6px solid #f1c40f';
                    } else if (index === 1) {
                      rankWeight = '800';
                      rowBackground = 'rgba(189,195,199,0.04)';
                      rowBorderLeft = '6px solid #bdc3c7';
                    } else if (index === 2) {
                      rankWeight = '700';
                      rowBackground = 'rgba(230,126,34,0.04)';
                      rowBorderLeft = '6px solid #e67e22';
                    } else {
                      rankWeight = '700';
                      rowBackground = 'rgba(255,255,255,0.02)';
                      rowBorderLeft = '6px solid rgba(255,255,255,0.2)';
                    }
                  } else {
                    rankWeight = '400';
                    rowBackground = 'rgba(231,76,60,0.02)';
                    rowBorderLeft = '6px solid rgba(231,76,60,0.25)';
                  }

                  const avatarBorder = isOut 
                    ? '3px solid rgba(231, 76, 60, 0.45)' 
                    : (index === 0 ? '4px solid #f1c40f' : '3px solid var(--accent)');
                  
                  const avatarShadow = isOut
                    ? '0 0 10px rgba(231, 76, 60, 0.15)'
                    : (index === 0 ? '0 0 25px rgba(241, 196, 15, 0.5)' : '0 0 18px rgba(39, 174, 96, 0.3)');
                  
                  const imgFilter = isOut ? 'grayscale(100%) opacity(65%) brightness(70%)' : 'none';

                  const scoreColor = isOut ? 'rgba(231, 76, 60, 0.65)' : (index === 0 ? '#f1c40f' : 'var(--warning)');
                  const scoreShadow = isOut ? 'none' : (index === 0 ? '0 0 15px rgba(241, 196, 15, 0.4)' : 'none');

                  let nameSize = rowHeightVh * 0.44;
                  if (p.length > 20) nameSize = rowHeightVh * 0.28;
                  else if (p.length > 15) nameSize = rowHeightVh * 0.32;
                  else if (p.length > 10) nameSize = rowHeightVh * 0.36;
                  nameSize = Math.max(1.1, Math.min(5.5, nameSize));

                  let scoreSize = rowHeightVh * 0.65;
                  scoreSize = Math.max(1.3, Math.min(8.5, scoreSize));

                  const reCount = getPlayerReEntriesCount(p, state);
                  const showRe = reCount > 0;

                  return (
                    <tr 
                      key={p} 
                      className={`${isOut ? 'opacity-30' : ''} transition-all duration-300`}
                      style={{
                        height: `${rowHeightVh}vh`,
                        background: rowBackground,
                        borderLeft: rowBorderLeft
                      }}
                    >
                      <td 
                        className="text-center font-mono py-0 px-4" 
                        style={{
                          fontSize: `max(1.2vh, calc(${rowHeightVh}vh * 0.44))`,
                          fontWeight: rankWeight
                        }}
                      >
                        {index + 1}
                      </td>
                      <td className="py-0 px-8 text-left">
                        <div className="flex items-center">
                          <img 
                            src={getTVAvatar(p)} 
                            className="mr-3 rounded-full object-cover shrink-0"
                            style={{
                              width: `calc(${rowHeightVh}vh * 0.72)`,
                              height: `calc(${rowHeightVh}vh * 0.72)`,
                              border: avatarBorder,
                              boxShadow: avatarShadow,
                              filter: imgFilter
                            }}
                            alt={p} 
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex items-center gap-3">
                            <span 
                              className={`font-black uppercase tracking-wide truncate ${isOut ? 'line-through italic text-white/20' : 'text-white'}`}
                              style={{
                                fontSize: `${nameSize}vh`,
                                textShadow: index === 0 && !isOut ? '0 0 12px rgba(241,196,15,0.4)' : 'none'
                              }}
                            >
                              {p}
                            </span>
                            {showRe && (
                              <span 
                                className="bg-emerald-500 text-white font-extrabold uppercase px-2 rounded flex items-center justify-center shadow-[0_0_10px_rgba(46,204,113,0.3)] shrink-0"
                                style={{
                                  fontSize: `max(0.9vh, calc(${rowHeightVh}vh * 0.15))`,
                                  height: `calc(${rowHeightVh}vh * 0.32)`
                                }}
                              >
                                {reCount > 1 ? `RE (${reCount})` : 'RE'}
                              </span>
                            )}
                            {p === dealer && (
                              <span 
                                className="bg-yellow-500 text-black font-extrabold uppercase px-2 rounded flex items-center justify-center shadow-[0_0_10px_rgba(241,196,15,0.3)] shrink-0"
                                style={{
                                  fontSize: `max(0.9vh, calc(${rowHeightVh}vh * 0.15))`,
                                  height: `calc(${rowHeightVh}vh * 0.32)`
                                }}
                              >
                                Dealer
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-right py-0 px-6 font-mono font-black rounded-r-lg">
                        <span 
                          style={{
                            color: scoreColor,
                            fontSize: `${scoreSize}vh`,
                            textShadow: scoreShadow
                          }}
                        >
                          {score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Past Players stand table ticking row */}
          {hasPast && (
            <div className="mt-2 border-t border-dashed border-white/10 pt-1 h-[4.5vh] overflow-hidden">
              <div className="flex items-center gap-4 h-full">
                <div className="text-[1.1vh] text-white/40 uppercase tracking-widest shrink-0">Out:</div>
                <div className="flex gap-3 overflow-x-auto whitespace-nowrap grow pr-4">
                  {past.map(p => (
                    <div 
                      key={p} 
                      className="text-[1.4vh] text-white/60 bg-white/3 py-0.5 px-3 rounded shrink-0 leading-tight"
                    >
                      {p}: <span className="text-yellow-500 font-extrabold">{state.totals?.[p]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showRuleset && (
        <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 text-left">
          <div className="bg-[#16222f] w-full max-w-xl p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/5 pb-3 font-sans">
              <h3 className="text-md md:text-lg font-black text-yellow-500 uppercase tracking-wider">
                Official Tournament Ruleset
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={downloadRulesetPDF}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-[11px] py-1 px-3 rounded cursor-pointer leading-tight uppercase"
                >
                  Download PDF 📜
                </button>
                <button 
                  onClick={() => setShowRuleset(false)}
                  className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer underline"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 text-xs mt-4 text-slate-300 font-sans leading-relaxed">
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">1. Seat Cut Rules & Ranking</h4>
                <p>
                  Calculated automatically before table startup using strict priorities to prevent disputes.
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">2. Card Ranking Rules</h4>
                <p>
                  Cards sorted descending: Ace (highest) &gt; King &gt; Queen &gt; Jack &gt; 10 &gt; 9 &gt; 8 &gt; 7 &gt; 6 &gt; 5 &gt; 4 &gt; 3 &gt; 2 &gt; Joker (lowest).
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">3. Suit Ranking</h4>
                <p>
                  To break equal value duplicate cards, suits determine ranks: Spades (♠) &gt; Hearts (♥) &gt; Diamonds (♦) &gt; Clubs (♣).
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">4. Joker Rules</h4>
                <p>
                  Joker is always the lowest possible rank. The player with Joker shifts directly as the Dealer unless another Joker exists. 
                  If multiple players select Joker, the earliest chronological entry timestamp becomes the lowest ranked.
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">5. Seating Clockwise Allocation</h4>
                <p>
                  Rank 1 chooses Seat 1. Ranks 2 down to N are seated sequentially clockwise around the tabletop.
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">6. Dealer Assignment</h4>
                <p>
                  The lowest-ranked player (last seated clockwise position) is designated the official Dealer of the table.
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">7. Card Distribution Sequence</h4>
                <p>
                  Dealer deals clockwise starting with the Highest-ranked seat cut player receiving first and the Dealer receiving their cards last.
                </p>
              </div>
              <div>
                <h4 className="text-yellow-500 font-bold uppercase tracking-wider mb-1">8. Tournament Integrity & Audit Trail</h4>
                <p>
                  Full audit logs featuring timestamp, player choices, corresponding seats, and dealer vectors are securely recorded to Firestore.
                </p>
              </div>
            </div>

            <button 
              onClick={() => setShowRuleset(false)}
              className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded font-bold cursor-pointer text-xs uppercase font-sans"
            >
              Back to Scoreboard
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
