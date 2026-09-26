import { db, EMPTY_GAME_STATS, listenToAuth, sendPasswordReset, signIn, signOutUser, signUp } from '../../firebase-client.js?v=202609262228';
import { doc, getDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const bridge = {
  onAuthStateChanged(callback) { return listenToAuth(callback); },
  signUp,
  signIn,
  signOut: signOutUser,
  sendPasswordReset,
  async loadUserData(user, dateKey) {
    const [profileSnapshot, gameSnapshot] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      dateKey ? getDoc(doc(db, 'users', user.uid, 'games', dateKey)) : Promise.resolve(null)
    ]);
    return {
      profile: profileSnapshot.exists() ? profileSnapshot.data() : null,
      game: gameSnapshot?.exists() ? gameSnapshot.data() : null
    };
  },
  async saveGame(user, dateKey, game, profileData) {
    if (!user) return null;
    const profileRef = doc(db, 'users', user.uid);
    const gameRef = doc(db, 'users', user.uid, 'games', dateKey);
    return runTransaction(db, async transaction => {
      const snapshot = await transaction.get(gameRef);
      const profileSnapshot = await transaction.get(profileRef);
      const remote = snapshot.exists() ? snapshot.data() : null;
      const remoteProfile = profileSnapshot.exists() ? profileSnapshot.data() : {};
      const incomingGuesses = Array.isArray(game.guesses) ? game.guesses : [];
      const remoteGuesses = Array.isArray(remote?.guesses) ? remote.guesses : [];
      const remoteDailyIsFinal = game.mode === 'daily' && remote?.date === game.date && remote?.gameOver && !game.gameOver;
      const useRemote = game.mode === 'daily' && remote?.date === game.date
        && (remoteDailyIsFinal || remoteGuesses.length > incomingGuesses.length
          || (remoteGuesses.length === incomingGuesses.length && (remote?.gameOver || (remote?.current || '').length > (game.current || '').length)));
      const preservedGame = useRemote ? remote : { ...game, guesses: incomingGuesses };
      if (game.mode === 'series' && remote?.order && game.order?.join('|') !== remote.order.join('|')) {
        throw new Error('A different Sefer order is already saved for this account.');
      }

      const gameStats = { ...EMPTY_GAME_STATS, ...(remoteProfile.gameStats || {}) };
      const harfane = { ...EMPTY_GAME_STATS.harfane, ...(gameStats.harfane || {}) };
      const daily = { ...EMPTY_GAME_STATS.harfane.daily, ...(harfane.daily || profileData.daily || {}) };
      if (game.mode === 'daily' && preservedGame.gameOver && !remote?.gameOver && daily.lastPlayedDate !== game.date) {
        const guesses = preservedGame.guesses || [];
        daily.played += 1;
        if (preservedGame.won) {
          daily.wins += 1;
          daily.streak = daily.lastPlayedDate === previousDate(game.date) ? daily.streak + 1 : 1;
          daily.best = Math.max(daily.best, daily.streak);
          if (guesses.length > 0 && guesses.length <= 6) daily.distribution[guesses.length - 1] += 1;
        } else daily.streak = 0;
        daily.lastPlayedDate = game.date;
      }
      harfane.daily = daily;
      harfane.sefer = { ...EMPTY_GAME_STATS.harfane.sefer, ...(profileData.sefer || harfane.sefer || {}) };
      const profile = {
        schemaVersion: 2,
        email: user.email || '',
        displayName: user.displayName || '',
        lastSeenAt: serverTimestamp(),
        gameStats: { ...gameStats, harfane }
      };
      if (!profileSnapshot.exists()) profile.createdAt = serverTimestamp();

      transaction.set(profileRef, profile, { merge: true });
      transaction.set(gameRef, {
        date: preservedGame.date || dateKey,
        mode: preservedGame.mode,
        level: preservedGame.level,
        seriesWins: preservedGame.seriesWins,
        seriesBest: preservedGame.seriesBest,
        completed: Boolean(preservedGame.completed),
        completedRuns: Number(preservedGame.completedRuns) || 0,
        ...(preservedGame.mode === 'series' ? { order: preservedGame.order } : {}),
        puzzleNumber: preservedGame.puzzleNumber,
        guesses: preservedGame.guesses,
        current: preservedGame.current || '',
        levelCounted: Boolean(preservedGame.levelCounted),
        gameOver: Boolean(preservedGame.gameOver),
        won: Boolean(preservedGame.won),
        attempts: (preservedGame.guesses || []).length,
        completedAt: serverTimestamp()
      }, { merge: true });
      return preservedGame;
    });
  }
};

function previousDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

window.firebaseBridge = bridge;
window.dispatchEvent(new CustomEvent('firebase-ready', { detail: bridge }));
