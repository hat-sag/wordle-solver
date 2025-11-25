import { useState, useMemo } from 'react';
import Head from 'next/head';
import { wordleWords } from '../data/words';

// Color states
const GRAY = 'gray';
const YELLOW = 'yellow';
const GREEN = 'green';

export default function Home() {
  // Each guess is { word: string, colors: [color, color, color, color, color] }
  const [guesses, setGuesses] = useState([]);
  const [currentWord, setCurrentWord] = useState('');
  const [currentColors, setCurrentColors] = useState([GRAY, GRAY, GRAY, GRAY, GRAY]);
  const [error, setError] = useState('');

  // Filter words based on all guesses
  const filteredWords = useMemo(() => {
    let words = [...wordleWords];
    
    for (const guess of guesses) {
      const { word, colors } = guess;
      
      words = words.filter(candidate => {
        for (let i = 0; i < 5; i++) {
          const letter = word[i];
          const color = colors[i];
          
          if (color === GREEN) {
            // Letter must be in this exact position
            if (candidate[i] !== letter) return false;
          } else if (color === YELLOW) {
            // Letter must be in word but NOT in this position
            if (candidate[i] === letter) return false;
            if (!candidate.includes(letter)) return false;
          } else if (color === GRAY) {
            // Letter is not in word (unless it's green/yellow elsewhere)
            const letterPositions = [];
            for (let j = 0; j < 5; j++) {
              if (word[j] === letter) letterPositions.push(j);
            }
            const hasGreenOrYellow = letterPositions.some(
              pos => colors[pos] === GREEN || colors[pos] === YELLOW
            );
            
            if (hasGreenOrYellow) {
              // Letter appears elsewhere as green/yellow, so gray just means not in THIS position
              if (candidate[i] === letter) return false;
            } else {
              // Letter is truly not in word
              if (candidate.includes(letter)) return false;
            }
          }
        }
        return true;
      });
    }
    
    return words;
  }, [guesses]);

  // Calculate letter frequencies by position
  const positionFrequencies = useMemo(() => {
    const frequencies = [];
    
    for (let pos = 0; pos < 5; pos++) {
      const letterCounts = {};
      
      for (const word of filteredWords) {
        const letter = word[pos];
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
      }
      
      // Convert to sorted array of { letter, count, percentage }
      const total = filteredWords.length;
      const sorted = Object.entries(letterCounts)
        .map(([letter, count]) => ({
          letter: letter.toUpperCase(),
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8); // Top 8 letters
      
      frequencies.push(sorted);
    }
    
    return frequencies;
  }, [filteredWords]);

  const handleWordChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
    setCurrentWord(val);
    setError('');
  };

  const cycleColor = (index) => {
    const newColors = [...currentColors];
    if (newColors[index] === GRAY) newColors[index] = YELLOW;
    else if (newColors[index] === YELLOW) newColors[index] = GREEN;
    else newColors[index] = GRAY;
    setCurrentColors(newColors);
  };

  const addGuess = () => {
    if (currentWord.length !== 5) {
      setError('Enter a 5-letter word');
      return;
    }
    
    setGuesses([...guesses, { word: currentWord, colors: currentColors }]);
    setCurrentWord('');
    setCurrentColors([GRAY, GRAY, GRAY, GRAY, GRAY]);
    setError('');
  };

  const removeGuess = (index) => {
    setGuesses(guesses.filter((_, i) => i !== index));
  };

  const reset = () => {
    setGuesses([]);
    setCurrentWord('');
    setCurrentColors([GRAY, GRAY, GRAY, GRAY, GRAY]);
    setError('');
  };

  const getColorClass = (color) => {
    if (color === GREEN) return 'tile-green';
    if (color === YELLOW) return 'tile-yellow';
    return 'tile-gray';
  };

  return (
    <>
      <Head>
        <title>Wordle Solver</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet" />
      </Head>
      
      <div className="container">
        <header>
          <h1>WORDLE SOLVER</h1>
          <p className="subtitle">Enter your guesses. Click tiles to cycle colors.</p>
        </header>

        {/* Previous Guesses */}
        {guesses.length > 0 && (
          <div className="guesses-section">
            <h2>Your Guesses</h2>
            <div className="guesses-list">
              {guesses.map((guess, gIdx) => (
                <div key={gIdx} className="guess-row">
                  <div className="guess-tiles">
                    {guess.word.split('').map((letter, lIdx) => (
                      <div key={lIdx} className={`tile ${getColorClass(guess.colors[lIdx])}`}>
                        {letter.toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <button className="remove-btn" onClick={() => removeGuess(gIdx)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Input */}
        <div className="input-section">
          <h2>{guesses.length === 0 ? 'Enter Your First Guess' : 'Enter Next Guess'}</h2>
          
          <div className="word-input-container">
            <input
              type="text"
              value={currentWord}
              onChange={handleWordChange}
              placeholder="Type word..."
              maxLength={5}
              className="word-input"
              onKeyDown={(e) => e.key === 'Enter' && addGuess()}
            />
          </div>

          {currentWord.length > 0 && (
            <div className="color-selector">
              <p className="color-hint">Click each tile to set its color:</p>
              <div className="color-tiles">
                {currentWord.split('').map((letter, idx) => (
                  <button
                    key={idx}
                    className={`tile clickable ${getColorClass(currentColors[idx])}`}
                    onClick={() => cycleColor(idx)}
                  >
                    {letter.toUpperCase()}
                  </button>
                ))}
                {/* Pad with empty tiles */}
                {Array(5 - currentWord.length).fill(null).map((_, idx) => (
                  <div key={`empty-${idx}`} className="tile tile-empty"></div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <div className="button-row">
            <button 
              className="btn btn-primary" 
              onClick={addGuess}
              disabled={currentWord.length !== 5}
            >
              Add Guess
            </button>
            {guesses.length > 0 && (
              <button className="btn btn-secondary" onClick={reset}>
                Reset All
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="results-section">
          <div className="results-header">
            <h2>Possible Words</h2>
            <span className="word-count">{filteredWords.length} remaining</span>
          </div>

          {filteredWords.length === 0 ? (
            <p className="no-words">No words match your criteria. Check your inputs!</p>
          ) : filteredWords.length <= 50 ? (
            <div className="word-grid">
              {filteredWords.map((word, idx) => (
                <div key={idx} className="word-item">{word}</div>
              ))}
            </div>
          ) : (
            <p className="too-many">Showing letter frequencies below. Add more guesses to narrow down.</p>
          )}
        </div>

        {/* Position Frequencies */}
        <div className="frequencies-section">
          <h2>Letter Probabilities by Position</h2>
          <p className="freq-hint">Use these to strategically pick your next guess</p>
          
          <div className="freq-grid">
            {positionFrequencies.map((freqs, posIdx) => (
              <div key={posIdx} className="freq-column">
                <h3>Position {posIdx + 1}</h3>
                <div className="freq-bars">
                  {freqs.map(({ letter, percentage }, idx) => (
                    <div key={idx} className="freq-item">
                      <span className="freq-letter">{letter}</span>
                      <div className="freq-bar-container">
                        <div 
                          className="freq-bar" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="freq-percent">{percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer>
          <p>Built for strategic Wordle solving</p>
        </footer>
      </div>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Outfit', sans-serif;
          background: #0a0a0f;
          color: #e8e6e3;
          min-height: 100vh;
          background-image: 
            radial-gradient(ellipse at 20% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(34, 197, 94, 0.1) 0%, transparent 50%);
        }
      `}</style>

      <style jsx>{`
        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }

        header {
          text-align: center;
          margin-bottom: 3rem;
        }

        h1 {
          font-family: 'Space Mono', monospace;
          font-size: 2.5rem;
          letter-spacing: 0.3em;
          background: linear-gradient(135deg, #22c55e 0%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.5rem;
        }

        .subtitle {
          color: #6b7280;
          font-size: 1rem;
        }

        h2 {
          font-family: 'Space Mono', monospace;
          font-size: 0.9rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-bottom: 1rem;
        }

        /* Tiles */
        .tile {
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Space Mono', monospace;
          font-size: 1.5rem;
          font-weight: 700;
          border-radius: 8px;
          text-transform: uppercase;
          transition: all 0.15s ease;
        }

        .tile-gray {
          background: #374151;
          border: 2px solid #4b5563;
          color: #e5e7eb;
        }

        .tile-yellow {
          background: #ca8a04;
          border: 2px solid #eab308;
          color: #fef9c3;
        }

        .tile-green {
          background: #16a34a;
          border: 2px solid #22c55e;
          color: #dcfce7;
        }

        .tile-empty {
          background: #1f2937;
          border: 2px dashed #374151;
        }

        .tile.clickable {
          cursor: pointer;
        }

        .tile.clickable:hover {
          transform: scale(1.05);
        }

        /* Guesses Section */
        .guesses-section {
          margin-bottom: 2rem;
        }

        .guesses-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .guess-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .guess-tiles {
          display: flex;
          gap: 6px;
        }

        .remove-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: #dc2626;
          color: white;
          font-size: 1.2rem;
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.15s;
        }

        .remove-btn:hover {
          opacity: 1;
        }

        /* Input Section */
        .input-section {
          background: rgba(31, 41, 55, 0.5);
          border: 1px solid #374151;
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .word-input-container {
          margin-bottom: 1rem;
        }

        .word-input {
          width: 100%;
          max-width: 300px;
          padding: 0.75rem 1rem;
          font-family: 'Space Mono', monospace;
          font-size: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          background: #111827;
          border: 2px solid #374151;
          border-radius: 8px;
          color: #e5e7eb;
          outline: none;
          transition: border-color 0.15s;
        }

        .word-input:focus {
          border-color: #6366f1;
        }

        .word-input::placeholder {
          text-transform: none;
          letter-spacing: normal;
          color: #4b5563;
        }

        .color-selector {
          margin-bottom: 1rem;
        }

        .color-hint {
          font-size: 0.85rem;
          color: #6b7280;
          margin-bottom: 0.75rem;
        }

        .color-tiles {
          display: flex;
          gap: 6px;
        }

        .error {
          color: #f87171;
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }

        .button-row {
          display: flex;
          gap: 1rem;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          font-family: 'Outfit', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-primary {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #374151;
          color: #e5e7eb;
        }

        .btn-secondary:hover {
          background: #4b5563;
        }

        /* Results Section */
        .results-section {
          background: rgba(31, 41, 55, 0.5);
          border: 1px solid #374151;
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .results-header h2 {
          margin-bottom: 0;
        }

        .word-count {
          font-family: 'Space Mono', monospace;
          font-size: 0.9rem;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
          padding: 0.25rem 0.75rem;
          border-radius: 99px;
        }

        .word-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 0.5rem;
        }

        .word-item {
          font-family: 'Space Mono', monospace;
          font-size: 0.95rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 0.5rem;
          background: #111827;
          border-radius: 6px;
          text-align: center;
        }

        .no-words, .too-many {
          color: #9ca3af;
          font-style: italic;
        }

        /* Frequencies Section */
        .frequencies-section {
          background: rgba(31, 41, 55, 0.5);
          border: 1px solid #374151;
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .freq-hint {
          color: #6b7280;
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
        }

        .freq-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .freq-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .freq-grid {
            grid-template-columns: 1fr;
          }
        }

        .freq-column {
          background: #111827;
          border-radius: 12px;
          padding: 1rem;
        }

        .freq-column h3 {
          font-family: 'Space Mono', monospace;
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.75rem;
          text-align: center;
        }

        .freq-bars {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .freq-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .freq-letter {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          width: 20px;
          color: #e5e7eb;
        }

        .freq-bar-container {
          flex: 1;
          height: 8px;
          background: #1f2937;
          border-radius: 4px;
          overflow: hidden;
        }

        .freq-bar {
          height: 100%;
          background: linear-gradient(90deg, #6366f1 0%, #22c55e 100%);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .freq-percent {
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          color: #6b7280;
          width: 32px;
          text-align: right;
        }

        footer {
          text-align: center;
          padding: 2rem 0;
          color: #4b5563;
          font-size: 0.85rem;
        }
      `}</style>
    </>
  );
}
