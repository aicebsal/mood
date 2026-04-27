'use client';

import { useState, useEffect } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, LogOut, Calendar as CalendarIcon, PlusCircle, User, Cloud, HardDrive, RefreshCw } from 'lucide-react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { cn } from '@/lib/utils';
import { auth, db, loginWithGoogle, logoutGoogle, hasFirebaseConfig } from '@/lib/firebase';
import { doc, setDoc, getDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';

// Types
type MoodType = 'increible' | 'bien' | 'normal' | 'mal' | 'horrible';
type EnergyType = 'baja' | 'media' | 'alta';

type MoodEntry = {
  emoji: MoodType;
  text: string;
  energy: EnergyType | null;
  word: string;
  timestamp: number;
};

type MoodData = Record<string, MoodEntry>;

// Constants
const MOOD_COLORS = {
  increible: 'bg-primary text-on-primary',
  bien: 'bg-secondary text-on-secondary',
  normal: 'bg-outline-variant text-white',
  mal: 'bg-tertiary text-on-tertiary',
  horrible: 'bg-error text-on-error',
};

const MOOD_HEX = {
  increible: '#3fff8b',
  bien: '#6e9bff',
  normal: '#767575',
  mal: '#ff7350',
  horrible: '#ff6e84',
};

const MOOD_EMOJIS = {
  increible: '😄',
  bien: '😊',
  normal: '😐',
  mal: '😞',
  horrible: '😢',
};

export default function HappyMoodApp() {
  const [localMoodData, setLocalMoodData] = useLocalStorage<MoodData>('happy_mood_data', {});
  const [cloudMoodData, setCloudMoodData] = useState<MoodData>({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [user, setUser] = useState<{ uid: string, displayName: string | null, photoURL: string | null } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Determinar qué datos usar based on auth state
  const moodData = user ? cloudMoodData : localMoodData;

  useEffect(() => {
    if (!auth) return;
    
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setUser({ uid: firebaseUser.uid, displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL });
        // Migrate local data to cloud if it exists and hasn't been migrated
        if (Object.keys(localMoodData).length > 0) {
          setIsSyncing(true);
          try {
            const batchPromises = Object.entries(localMoodData).map(([date, entry]) => {
              return setDoc(doc(db!, `users/${firebaseUser.uid}/moods/${date}`), entry, { merge: true });
            });
            await Promise.all(batchPromises);
            // Clear local data after migration (opcional)
            setLocalMoodData({});
          } catch (err: any) {
            console.error("Migration failed:", err);
          } finally {
            setIsSyncing(false);
          }
        }
      } else {
        setUser(null);
        setCloudMoodData({});
      }
    });
    return () => unsubscribe();
  }, [localMoodData, setLocalMoodData]);

  // Read data from cloud
  useEffect(() => {
    if (!user || !db) return;
    
    // Solo traemos el mes actual para no traer toda la base de datos de golpe
    // Pero como Firebase rules y la forma simple aquí pide todos los moods, traemos todo:
    const moodsRef = collection(db, `users/${user.uid}/moods`);
    const unsubscribe = onSnapshot(moodsRef, (snapshot) => {
      const data: MoodData = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data() as MoodEntry;
      });
      setCloudMoodData(data);
    }, (error) => {
      console.error("Error fetching data:", error);
      setErrorMsg("Error de lectura: " + error.message);
    });

    return () => unsubscribe();
  }, [user]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleSaveMood = async (entry: MoodEntry) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    if (user && db) {
      setIsSyncing(true);
      try {
        await setDoc(doc(db, `users/${user.uid}/moods/${dateStr}`), entry);
      } catch (err: any) {
        console.error("Save error:", err);
        setErrorMsg("Error al guardar: " + err.message);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setLocalMoodData(prev => ({
        ...prev,
        [dateStr]: entry
      }));
    }
  };

  const handleLogin = async () => {
    if (!hasFirebaseConfig) {
      setErrorMsg("Falta configuración de Firebase.");
      return;
    }
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutGoogle();
    } catch (err: any) {
      console.error(err);
    }
  };

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const currentEntry = moodData[selectedDateStr];

  return (
    <>
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <span className="text-2xl font-bold tracking-tighter text-primary font-headline">HAPPY MOOD</span>
            <nav className="hidden md:flex gap-6 items-center">
              <button className="text-primary font-bold font-headline tracking-tight hover:text-primary transition-colors duration-300">Calendario</button>
              <button className="text-on-surface-variant font-headline tracking-tight hover:text-primary transition-colors duration-300">Estadísticas</button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            
            {/* Indicador de estado */}
            <div className="hidden md:flex items-center gap-2 mr-2 px-3 py-1.5 rounded-full bg-surface-container-high border border-white/5 cursor-default">
              {isSyncing ? (
                <RefreshCw className="w-4 h-4 text-primary animate-spin" />
              ) : user ? (
                <Cloud className="w-4 h-4 text-secondary" />
              ) : (
                <HardDrive className="w-4 h-4 text-on-surface-variant" />
              )}
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                {isSyncing ? 'Sincronizando' : user ? 'En Nube' : 'En Local'}
              </span>
            </div>

            {!user ? (
              <button 
                onClick={handleLogin}
                className="hidden lg:block px-4 py-1.5 rounded-full bg-surface-container-low text-xs font-medium text-on-surface-variant border border-outline-variant/30 hover:text-white hover:border-outline-variant transition-all"
              >
                Inicia sesión con Google para guardar tu historial
              </button>
            ) : (
              <div className="flex items-center gap-3 pl-4 border-l border-outline-variant/30">
                <span className="hidden sm:block text-sm font-medium text-white">{user.displayName || 'Usuario'}</span>
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary p-[2px]">
                  <div className="w-full h-full rounded-full bg-surface-container-high flex items-center justify-center overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-5 h-5 text-on-surface-variant" />
                    )}
                  </div>
                </div>
                <button onClick={handleLogout} className="text-on-surface-variant hover:text-error transition-colors duration-300">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Error Toast */}
      {errorMsg && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-error/90 text-white px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto pt-28 px-6 grid grid-cols-1 md:grid-cols-12 gap-12">
        <Calendar 
          currentMonth={currentMonth}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          moodData={moodData}
        />
        <MoodForm 
          key={selectedDate.toISOString()}
          selectedDate={selectedDate}
          entry={currentEntry}
          onSave={handleSaveMood}
        />
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-6 pt-2 bg-surface-container-low/80 backdrop-blur-2xl shadow-[0_-8px_30px_rgb(0,0,0,0.5)] rounded-t-[32px] border-t border-white/5">
        <button className="flex flex-col items-center justify-center text-on-surface-variant p-3 hover:bg-surface-container-high rounded-full transition-all">
          <CalendarIcon className="w-6 h-6" />
          <span className="text-[11px] font-medium mt-1">Calendario</span>
        </button>
        <button 
          onClick={() => setSelectedDate(new Date())}
          className="flex flex-col items-center justify-center bg-surface-container-high text-primary rounded-full p-3 shadow-lg scale-110 border border-primary/20"
        >
          <PlusCircle className="w-8 h-8" />
        </button>
        <button 
          onClick={user ? handleLogout : handleLogin}
          className="flex flex-col items-center justify-center text-on-surface-variant p-3 hover:bg-surface-container-high rounded-full transition-all"
        >
          <User className="w-6 h-6" />
          <span className="text-[11px] font-medium mt-1">{user ? 'Salir' : 'Perfil'}</span>
        </button>
      </nav>

      {/* Background Decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 opacity-30 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-[600px] h-[600px] bg-secondary/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] bg-primary/10 blur-[100px] rounded-full"></div>
      </div>
    </>
  );
}

function Calendar({ 
  currentMonth, 
  onPrevMonth, 
  onNextMonth, 
  selectedDate, 
  onSelectDate,
  moodData 
}: {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  moodData: MoodData;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const startDay = monthStart.getDay(); 
  const paddingDays = startDay === 0 ? 6 : startDay - 1;
  
  return (
    <section className="md:col-span-5 flex flex-col gap-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white capitalize">
            {format(currentMonth, 'MMMM', { locale: es })}
          </h2>
          <p className="text-on-surface-variant text-sm mt-1">Tu viaje emocional de este mes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onPrevMonth} className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-all">
            <ChevronLeft size={24} />
          </button>
          <button onClick={onNextMonth} className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-all">
            <ChevronRight size={24} />
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-7 gap-2">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
          <div key={day} className="text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 pb-2">
            {day}
          </div>
        ))}
        
        {Array.from({ length: paddingDays }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square"></div>
        ))}
        
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const entry = moodData[dateStr];
          const isSelected = isSameDay(day, selectedDate);
          
          let dayClass = "aspect-square rounded-xl flex items-center justify-center text-sm font-medium transition-all ";
          
          if (entry) {
            dayClass += MOOD_COLORS[entry.emoji] + " font-bold ";
            if (entry.emoji === 'increible') {
               dayClass += " shadow-[0_0_20px_rgba(63,255,139,0.3)] ";
            }
          } else {
            dayClass += "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high ";
          }
          
          if (isSelected && !entry) {
            dayClass += "ring-2 ring-primary bg-surface-container-high text-primary font-bold ";
          } else if (isSelected && entry) {
            dayClass += "ring-2 ring-white scale-110 z-10 ";
          }
          
          return (
            <button 
              key={dateStr}
              onClick={() => onSelectDate(day)}
              className={dayClass}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
      
      {/* Legends */}
      <div className="flex flex-wrap gap-4 pt-4 opacity-70">
        {Object.entries(MOOD_COLORS).map(([mood, colorClass]) => (
          <div key={mood} className="flex items-center gap-2 text-[11px] font-bold text-on-surface-variant capitalize">
            <div className={cn("w-3 h-3 rounded-full", colorClass.split(' ')[0])}></div> 
            {mood}
          </div>
        ))}
      </div>
    </section>
  );
}

function MoodForm({ 
  selectedDate, 
  entry, 
  onSave 
}: {
  selectedDate: Date;
  entry?: MoodEntry;
  onSave: (entry: MoodEntry) => void;
}) {
  const [emoji, setEmoji] = useState<MoodType | null>(entry?.emoji || null);
  const [text, setText] = useState(entry?.text || '');
  const [energy, setEnergy] = useState<EnergyType | null>(entry?.energy || null);
  const [word, setWord] = useState(entry?.word || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    if (!emoji) return;
    
    setIsSaving(true);
    setTimeout(() => {
      onSave({
        emoji,
        text,
        energy,
        word,
        timestamp: Date.now()
      });
      setIsSaving(false);
    }, 600);
  };

  const dateStr = format(selectedDate, "EEEE, d", { locale: es });

  return (
    <section className="md:col-span-7 pb-12 relative">
      <div className="bg-surface-container-low/60 backdrop-blur-xl rounded-[40px] p-8 md:p-12 shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
        
        <header className="mb-12">
          <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-2 block">
            {isToday(selectedDate) ? `Hoy es ${dateStr}` : dateStr}
          </span>
          <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tight text-white">
            {isToday(selectedDate) ? '¿Cómo te sientes hoy?' : '¿Cómo te sentiste?'}
          </h1>
        </header>

        <div className="space-y-12">
          {/* Emoji Selector */}
          <div>
            <div className="flex justify-between items-center gap-2 md:gap-4 overflow-x-auto pb-4 no-scrollbar">
              {(Object.keys(MOOD_EMOJIS) as Array<MoodType>).map((m) => (
                <button 
                  key={m}
                  onClick={() => setEmoji(m)}
                  className="group flex flex-col items-center gap-3 min-w-[70px]"
                >
                  <motion.div 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    animate={{ 
                      scale: emoji === m ? 1.1 : 1,
                      backgroundColor: emoji === m ? MOOD_HEX[m] + '33' : '#20201f',
                      borderColor: emoji === m ? MOOD_HEX[m] : 'transparent'
                    }}
                    className={cn(
                      "w-14 h-14 md:w-16 md:h-16 rounded-3xl flex items-center justify-center text-3xl transition-colors border-2",
                      emoji === m ? "" : "border-transparent"
                    )}
                  >
                    {MOOD_EMOJIS[m]}
                  </motion.div>
                  <span 
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-widest transition-colors",
                      emoji === m ? "" : "text-on-surface-variant group-hover:text-white"
                    )}
                    style={{ color: emoji === m ? MOOD_HEX[m] : undefined }}
                  >
                    {m}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Journal Area */}
          <div className="space-y-6">
            <div className="relative group">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-4 pl-1 group-focus-within:text-primary transition-colors">
                {isToday(selectedDate) ? '¿Qué ha pasado hoy?' : '¿Qué pasó este día?'}
              </label>
              <textarea 
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-transparent border-none p-0 focus:ring-0 text-2xl font-body text-white placeholder:text-on-surface-variant/20 resize-none min-h-[120px] outline-none" 
                maxLength={150} 
                placeholder="Escribe tus pensamientos aquí..."
              />
              <div className="h-px w-full bg-outline-variant/20 mt-2 group-focus-within:bg-primary/50 transition-colors"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              {/* Energy Selector */}
              <div className="space-y-4">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant pl-1">Energía</label>
                <div className="flex gap-2">
                  {['baja', 'media', 'alta'].map((lvl) => (
                    <button 
                      key={lvl}
                      onClick={() => setEnergy(lvl as EnergyType)}
                      className={cn(
                        "px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
                        energy === lvl 
                          ? "bg-primary text-on-primary" 
                          : "border border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-primary"
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* One Word */}
              <div className="space-y-4">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant pl-1">Una palabra</label>
                <input 
                  type="text"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-2xl px-5 py-3 text-sm font-medium text-white focus:ring-2 focus:ring-primary/20 outline-none" 
                  maxLength={30} 
                  placeholder="Ej: Calma" 
                />
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="pt-8">
            <motion.button 
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={!emoji || isSaving}
              className={cn(
                "w-full md:w-auto px-12 py-5 rounded-full font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300",
                emoji 
                  ? "bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-[0_20px_40px_rgba(63,255,139,0.2)] hover:shadow-[0_25px_50px_rgba(63,255,139,0.3)]" 
                  : "bg-surface-container-high text-on-surface-variant cursor-not-allowed",
                isSaving && "animate-pulse"
              )}
            >
              <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
              {!isSaving && <ChevronRight className="w-5 h-5" />}
            </motion.button>
          </div>
        </div>
      </div>
    </section>
  );
}
