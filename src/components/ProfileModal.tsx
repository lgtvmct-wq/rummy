import React, { useState, useEffect } from 'react';
import { Player, GameState } from '../types';
import { auth, db } from '../services/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { formatEliteDate } from '../game/gameLogic';
import { jsPDF } from 'jspdf';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string | null;
  playersDb: Player[];
  savedGames: GameState[];
  onProfileUpdated?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  uid,
  playersDb,
  savedGames,
  onProfileUpdated
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');

  const p = playersDb.find(x => x.id === uid);

  const handleDeletePlayer = async () => {
    if (!uid || !p) return;
    const name = p.fullName || 'Player';
    if (!window.confirm(`Are you sure you want to permanently delete user "${name}"? This will immediately remove them from the Hall of fame list and seat selection.`)) return;
    try {
      await deleteDoc(doc(db, 'players', uid));
      alert(`Player "${name}" was successfully removed.`);
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to delete player from database. Verify active network connection.');
    }
  };

  useEffect(() => {
    if (p) {
      setEditName(p.fullName || '');
      setEditPhoto(p.photoURL || '');
    }
  }, [p, uid]);

  if (!isOpen || !p) return null;

  const displayName = p.fullName || `Elite-ID: ${p.id.substring(0, 8)}`;
  
  // Stats calculations
  const playerGames = savedGames.filter(g => 
    g.winner && 
    g.players?.includes(displayName) && 
    !g.isAborted && 
    !g.isDeleted
  );
  
  const winsCount = playerGames.filter(g => g.winner === displayName).length;
  
  let shows = 0;
  let fcs = 0;
  let drops = 0;
  let mds = 0;

  playerGames.forEach(g => {
    if (g.actionStats && g.actionStats[displayName]) {
      shows += g.actionStats[displayName].shows || 0;
      fcs += g.actionStats[displayName].fcs || 0;
      drops += g.actionStats[displayName].drops || 0;
      mds += g.actionStats[displayName].mds || 0;
    }
  });

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 150;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setEditPhoto(compressed);
        }
      };
      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== uid) return;
    try {
      const userRef = doc(db, 'players', uid);
      await updateDoc(userRef, {
        fullName: editName.toUpperCase().trim(),
        photoURL: editPhoto
      });
      setIsEditing(false);
      if (onProfileUpdated) {
        onProfileUpdated();
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to save profile changes.');
    }
  };

  const triggerPDFCertificate = (game: GameState) => {
    if (!game || !game.winner) return alert("Certificate only available for finished games.");
    if (game.isAborted) return alert("Certificate not available for abandoned games.");
    
    // Create PDF in Landscape
    const docPdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const sanitizePDF = (s: string) => (s || "").replace(/[^\x20-\x7E\xA0-\xFF]/g, " ").trim();
    const winnerName = sanitizePDF(game.winner).toUpperCase();
    const gameName = sanitizePDF(game.name) || "Elite Game";
    const dateStr = sanitizePDF(game.endTime || game.startTime || formatEliteDate(new Date()));
    
    // Background: Rich Parchment
    docPdf.setFillColor(252, 250, 242);
    docPdf.rect(0, 0, 297, 210, 'F');

    // Watermark
    docPdf.setTextColor(235, 235, 235);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(100);
    docPdf.text("ELITE", 148.5, 165, { align: "center", angle: 0 });

    // Ornamental Borders (Gold & Black)
    docPdf.setDrawColor(165, 124, 0); // Golden Rod
    docPdf.setLineWidth(4);
    docPdf.rect(8, 8, 281, 194); // Outer most

    docPdf.setDrawColor(30, 30, 30); // Charcoal Black
    docPdf.setLineWidth(0.5);
    docPdf.rect(13, 13, 271, 184); // Inner line 1
    docPdf.rect(15, 15, 267, 180); // Inner line 2

    // Header
    docPdf.setTextColor(20, 20, 20);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(48);
    docPdf.text("CERTIFICATE OF TRIUMPH", 148.5, 52, { align: "center" });

    docPdf.setTextColor(165, 124, 0);
    docPdf.setFontSize(18);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("ELITE RUMMY CIRCLE CHAMPIONSHIP", 148.5, 63, { align: "center" });

    // Decorative Separator
    docPdf.setDrawColor(165, 124, 0);
    docPdf.setLineWidth(0.8);
    docPdf.line(90, 70, 207, 70);

    // Salutation
    docPdf.setTextColor(70, 70, 70);
    docPdf.setFont("helvetica", "italic");
    docPdf.setFontSize(20);
    docPdf.text("This official commendation is awarded to", 148.5, 90, { align: "center" });

    // Winner Name: Center Piece
    docPdf.setTextColor(0, 0, 0);
    docPdf.setFontSize(52);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(winnerName, 148.5, 115, { align: "center" });
    
    // Name Underline
    docPdf.setDrawColor(0, 0, 0);
    docPdf.setLineWidth(1.2);
    docPdf.line(50, 120, 247, 120);

    // Detailed Achievement Text
    docPdf.setTextColor(50, 50, 50);
    docPdf.setFontSize(16);
    docPdf.setFont("helvetica", "normal");
    const achievementLine1 = `for emerging victorious in the game of "${gameName}"`;
    const achievementLine2 = `demonstrating exceptional mental discipline and tactical excellence.`;
    
    docPdf.text(achievementLine1, 148.5, 138, { align: "center" });
    docPdf.text(achievementLine2, 148.5, 148, { align: "center" });

    // Footer: Signatures & Verification
    docPdf.setFontSize(14);
    docPdf.setTextColor(30, 30, 30);
    
    // Date Section (Left)
    docPdf.text(dateStr, 75, 175, { align: "center" });
    docPdf.setDrawColor(100, 100, 100);
    docPdf.setLineWidth(0.5);
    docPdf.line(45, 170, 105, 170);
    docPdf.setFontSize(11);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("AWARD DATE", 75, 182, { align: "center" });

    // Commissioner Section (Right)
    docPdf.setFontSize(14);
    docPdf.text("S. A. R.", 222, 175, { align: "center" });
    docPdf.setDrawColor(100, 100, 100);
    docPdf.setLineWidth(0.5);
    docPdf.line(192, 170, 252, 170);
    docPdf.setFontSize(11);
    docPdf.text("ELITE RUMMY COMMISSIONER", 222, 182, { align: "center" });

    // Official Seal (Top Right)
    docPdf.setFillColor(31, 58, 147); // Dark Academic Blue
    docPdf.circle(260, 40, 18, 'F');
    docPdf.setDrawColor(165, 124, 0);
    docPdf.setLineWidth(1.5);
    docPdf.circle(260, 40, 16);
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(10);
    docPdf.text("AUTHENTIC", 260, 38, { align: "center" });
    docPdf.text("ELITE", 260, 42, { align: "center" });
    docPdf.text("WINNER", 260, 46, { align: "center" });
    
    // Final Save
    const safeName = winnerName.replace(/[^a-z0-9]/gi, '_');
    docPdf.save(`Elite_Certificate_${safeName}.pdf`);
  };

  const wonGames = playerGames.filter(g => g.winner === displayName);
  const isCurrentUser = auth.currentUser?.uid === uid;

  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2c3e50&color=fff&size=200`;

  return (
    <>
      {/* View Profile Modal */}
      <div className="modal-overlay" style={{ display: !isEditing ? 'flex' : 'none' }}>
        <div className="modal-card">
          <img 
            className="avatar-lg h-24 w-24 rounded-full object-cover mx-auto border-2 border-[var(--accent)] shadow-md shadow-emerald-500/20" 
            src={p.photoURL || defaultAvatar} 
            alt={displayName} 
            referrerPolicy="no-referrer"
          />
          <h2 className="text-xl font-bold mt-2 text-[var(--accent)] text-center">{displayName}</h2>
          <p className="text-[10px] opacity-50 mb-4 text-center">PLAYER ID: {p.id}</p>
          
          <div className="stat-grid mb-4">
            <div className="stat-item">
              <span className="stat-val text-yellow-500">{winsCount}</span>
              <span className="stat-lbl text-[10px] uppercase opacity-75">Wins</span>
            </div>
            <div className="stat-item">
              <span className="stat-val text-amber-500">{shows}</span>
              <span className="stat-lbl text-[10px] uppercase opacity-75">Shows</span>
            </div>
            <div className="stat-item">
              <span className="stat-val text-red-500">{fcs}</span>
              <span className="stat-lbl text-[10px] uppercase opacity-75">Full</span>
            </div>
            <div className="stat-item">
              <span className="stat-val text-orange-400">{drops}</span>
              <span className="stat-lbl text-[10px] uppercase opacity-75">Drops</span>
            </div>
            <div className="stat-item">
              <span className="stat-val text-purple-400">{mds}</span>
              <span className="stat-lbl text-[10px] uppercase opacity-75">Mid</span>
            </div>
            <div className="stat-item">
              <span className="stat-val text-blue-400">{playerGames.length}</span>
              <span className="stat-lbl text-[10px] uppercase opacity-75">Games</span>
            </div>
          </div>

          <div className="bg-emerald-950/20 border-l-4 border-[var(--accent)] p-3 rounded text-left text-xs mb-4 leading-relaxed text-slate-300">
            <div className="flex flex-col gap-2">
              <div>
                <strong>MEDALS & RANK:</strong>
                <div 
                  className="grid grid-cols-3 gap-2 mt-2 cursor-pointer text-center"
                  title="3 wins = PRO | 6 wins = ULTRA PRO | 10 wins = ULTRA PRO MAX"
                  onClick={() => alert("🏅 PRO: 3+ Wins\n🏆 ULTRA PRO: 6+ Wins\n👑 ULTRA PRO MAX: 10+ Wins")}
                >
                  <div className={winsCount >= 3 ? 'opacity-100' : 'opacity-20'}>
                    <div className="text-xl">🏅</div>
                    <div className="text-[9px] font-bold text-amber-600">PRO</div>
                    <div className="text-xs">{winsCount >= 3 ? 1 : 0}</div>
                  </div>
                  <div className={winsCount >= 6 ? 'opacity-100' : 'opacity-20'}>
                    <div className="text-xl">🏆</div>
                    <div className="text-[9px] font-bold text-orange-500">ULTRA PRO</div>
                    <div className="text-xs">{winsCount >= 6 ? 1 : 0}</div>
                  </div>
                  <div className={winsCount >= 10 ? 'opacity-100' : 'opacity-20'}>
                    <div className="text-xl">👑</div>
                    <div className="text-[9px] font-bold text-yellow-400">ULTRA PRO MAX</div>
                    <div className="text-xs">{winsCount >= 10 ? 1 : 0}</div>
                  </div>
                </div>
              </div>

              {wonGames.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <strong className="text-[11px] block mb-2 text-yellow-500">AWARDED CERTIFICATES</strong>
                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {wonGames.map(g => (
                      <button 
                        key={g.id}
                        onClick={() => triggerPDFCertificate(g)}
                        className="bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] py-1 px-2.5 w-full text-left rounded font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        📜 {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full mt-2">
            {isCurrentUser && (
              <button 
                onClick={() => setIsEditing(true)}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm py-2 px-4 rounded transition cursor-pointer"
              >
                Edit My Profile
              </button>
            )}
            {!isCurrentUser && (
              <button 
                onClick={handleDeletePlayer}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold text-sm py-2 px-4 rounded transition cursor-pointer border border-red-700/50"
              >
                Delete / Clean-Up Player
              </button>
            )}
            <button 
              onClick={onClose}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm py-2 px-4 rounded transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <div className="modal-overlay" style={{ display: isEditing ? 'flex' : 'none' }}>
        <div className="modal-card">
          <h2 className="text-lg font-bold text-center text-[var(--accent)] mb-4">Edit Profile</h2>
          
          <img 
            className="avatar-lg h-24 w-24 rounded-full object-cover mx-auto border-2 border-[var(--accent)] shadow-md mb-2" 
            src={editPhoto || defaultAvatar} 
            alt="Preview" 
            referrerPolicy="no-referrer"
          />
          
          <input 
            type="file" 
            id="photoUpload" 
            style={{ display: 'none' }} 
            onChange={handlePhotoUpload}
            accept="image/*"
          />
          <button 
            onClick={() => document.getElementById('photoUpload')?.click()}
            className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs py-1.5 px-3 rounded mx-auto block mb-4 cursor-pointer"
          >
            Change Photo
          </button>
          
          <input 
            type="text"
            className="std-input w-full text-center"
            placeholder="Display Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <div className="flex gap-2 w-full mt-4">
            <button 
              onClick={() => setIsEditing(false)}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm py-2 px-4 rounded transition cursor-pointer"
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveProfile}
              className="flex-1 bg-[var(--accent)] hover:opacity-90 text-white font-semibold text-sm py-2 px-4 rounded transition cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
