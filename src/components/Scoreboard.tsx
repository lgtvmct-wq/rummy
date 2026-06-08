{showSeatCutLog && state?.seatCutOutcome && (
  <div className="fixed inset-0 z-[8500] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 text-left">
    <div className="bg-[#16222f] w-full max-w-xl p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto font-sans">
      <div className="flex justify-between items-center border-b border-white/5 pb-3">
        <h3 className="text-md md:text-lg font-black text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
          <span>📜 Seat Cut Protocol Audit Log</span>
        </h3>
        <button 
          onClick={() => setShowSeatCutLog(false)}
          className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer underline"
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
            👑 Starting Dealer: {state?.seatCutOutcome?.dealer}
          </span>
        </div>

        {/* Seating Order List */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Clockwise Seating Order
          </span>
          <div className="flex flex-col gap-2 mt-1 font-mono text-xs">
            {state?.seatCutOutcome?.seatingOrder?.map((s) => {
              const isDealer = s.player === state?.seatCutOutcome?.dealer;
              return (
                <div 
                  key={s.seat} 
                  className={`flex justify-between items-center p-3 rounded-xl border ${
                    isDealer 
                      ? 'bg-red-950/20 border-red-500/20' 
                      : (s.rank === 1 ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-slate-950/50 border-white/5')
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
        {state?.seatCutOutcome?.distributionOrder && (
          <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 flex flex-col gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Clockwise Distribution sequence
            </span>
            <div className="flex flex-col gap-1.5 text-xs font-mono mt-1">
              {state?.seatCutOutcome?.distributionOrder?.map((pName, idx) => (
                <div key={pName} className="flex gap-3 items-center">
                  <span className="text-[10px] text-slate-500 font-bold w-4">
                    {idx + 1}.
                  </span>
                  <span className={idx === 0 ? 'text-emerald-400 font-bold' : (pName === state?.seatCutOutcome?.dealer ? 'text-red-400 font-bold' : 'text-slate-300')}>
                    {pName} {idx === 0 ? '(Receives First, clock-one)' : (pName === state?.seatCutOutcome?.dealer ? '(Dealer last)' : '')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button 
        onClick={() => setShowSeatCutLog(false)}
        className="mt-6 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-bold cursor-pointer text-xs uppercase font-sans transition"
      >
        Back to Scoreboard
      </button>
    </div>
  </div>
)}
