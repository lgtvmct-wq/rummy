import React, { useEffect, useRef } from 'react';
import { GameState, Player } from '../types';
import { getExitLimitFor, getPlayerReEntriesCount, getDealerForState } from '../game/gameLogic';

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
      {/* TV Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 z-[7000] bg-slate-800/80 hover:bg-slate-700 hover:text-red-400 text-xs text-white/70 py-1 px-4 rounded border border-white/10 transition cursor-pointer"
      >
        Close Screen
      </button>

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
    </div>
  );
};
