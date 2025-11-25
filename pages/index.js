import { useState, useMemo } from 'react';
import Head from 'next/head';
import { wordleWords } from '../data/words';

// Color states
const GRAY = 'gray';
const YELLOW = 'yellow';
const GREEN = 'green';

// Helper: Given a guess and an answer, return the color pattern
function getColorPattern(guess, answer) {
  const pattern = ['gray', 'gray', 'gray', 'gray', 'gray'];
  const answerLetters = answer.split('');
  const guessLetters = guess.split('');
  
  // First pass: mark greens
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === answerLetters[i]) {
      pattern[i] = 'green';
      answerLetters[i] = null;
      guessLetters[i] = null;
    }
  }
  
  // Second pass: mark yellows
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] !== null) {
      const idx = answerLetters.indexOf(guessLetters[i]);
      if (idx !== -1) {
        pattern[i] = 'yellow';
        answerLetters[idx] = null;
      }
    }
  }
  
  return pattern.join(',');
}

// Calculate best guesses from remaining words based on expected elimination
function calculateBestGuesses(remainingWords) {
  if (remainingWords.length <= 1) return [];
  if (remainingWords.length > 150) return [];
  
  const guessScores = [];
  
  for (const guess of remainingWords) {
    const patternBuckets = {};
    
    for (const answer of remainingWords) {
      const pattern = getColorPattern(guess, answer);
      patternBuckets[pattern] = (patternBuckets[pattern] || 0) + 1;
    }
    
    const bucketSizes = Object.values(patternBuckets);
    const expectedRemaining = bucketSizes.reduce((sum, size) => sum + (size * size), 0) / remainingWords.length;
    const eliminationPct = ((remainingWords.length - expectedRemaining) / remainingWords.length) * 100;
    
    guessScores.push({
      word: guess,
      expectedRemaining,
      eliminationPct
    });
  }
  
  guessScores.sort((a, b) => a.expectedRemaining - b.expectedRemaining);
  return guessScores.slice(0, 8);
}

// Calculate most common letters across remaining words (excluding already known letters)
function calculateCommonLetters(remainingWords, knownLetters) {
  const letterCounts = {};
  
  for (const word of remainingWords) {
    // Count unique letters per word (so a word with 'ee' only counts 'e' once)
    const uniqueLetters = [...new Set(word.split(''))];
    for (const letter of uniqueLetters) {
      if (!knownLetters.has(letter)) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
      }
    }
  }
  
  return Object.entries(letterCounts)
    .map(([letter, count]) => ({
      letter: letter.toUpperCase(),
      count,
      percentage: Math.round((count / remainingWords.length) * 100)
    }))
    .sort((a, b) => b.count - a.count);
}

// Find words from full dictionary that contain the most common untested letters
function calculateInfoGatheringWords(remainingWords, allWords, knownLetters) {
  if (remainingWords.length <= 2) return [];
  
  const commonLetters = calculateCommonLetters(remainingWords, knownLetters);
  const topLetters = commonLetters.slice(0, 10).map(l => l.letter.toLowerCase());
  
  if (topLetters.length === 0) return [];
  
  const wordScores = [];
  
  for (const word of allWords) {
    const uniqueLetters = [...new Set(word.split(''))];
    const matchingLetters = uniqueLetters.filter(l => topLetters.includes(l));
    const score = matchingLetters.length;
    
    // Bonus: prefer words that could also be answers
    const couldBeAnswer = remainingWords.includes(word);
    
    if (score >= 3) {
      wordScores.push({
        word,
        score,
        matchingLetters: matchingLetters.map(l => l.toUpperCase()),
        couldBeAnswer
      });
    }
  }
  
  // Sort by score (descending), then by couldBeAnswer
  wordScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.couldBeAnswer - a.couldBeAnswer;
  });
  
  return wordScores.slice(0, 8);
}

// Extract all letters that have been tested from guesses
function getKnownLetters(guesses) {
  const known = new Set();
  for (const guess of guesses) {
    for (const letter of guess.word) {
      known.add(letter);
    }
  }
  return known;
}

export default function Home() {
  const [guesses, setGuesses] = useState([]);
  const [currentWord, setCurrentWord] = useState('');
  const [currentColors, setCurrentColors] = useState([GRAY, GRAY, GRAY, GRAY, GRAY]);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showInfoMode, setShowInfoMode] = useState(false);

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
            if (candidate[i] !== letter) return false;
          } else if (color === YELLOW) {
            if (candidate[i] === letter) return false;
            if (!candidate.includes(letter)) return false;
          } else if (color === GRAY) {
            const letterPositions = [];
            for (let j = 0; j < 5; j++) {
              if (word[j] === letter) letterPositions.push(j);
            }
            const hasGreenOrYellow = letterPositions.some(
              pos => colors[pos] === GREEN || colors[pos] === YELLOW
            );
            
            if (hasGreenOrYellow) {
              if (candidate[i] === letter) return false;
            } else {
              if (candidate.includes(letter)) return false;
            }
          }
        }
        return true;
      });
    }
    
    return words;
  }, [guesses]);

  // Get letters we've already tested
  const knownLetters = useMemo(() => getKnownLetters(guesses), [guesses]);

  // Calculate best guesses (only when panel is open)
  const bestGuesses = useMemo(() => {
    if (!showSuggestions) return [];
    return calculateBestGuesses(filteredWords);
  }, [filteredWords, showSuggestions]);

  // Calculate common letters and info gathering words
  const commonLetters = useMemo(() => {
    if (!showInfoMode) return [];
    return calculateCommonLetters(filteredWords, knownLetters);
  }, [filteredWords, knownLetters, showInfoMode]);

  const infoGatheringWords = useMemo(() => {
    if (!showInfoMode) return [];
    return calculateInfoGatheringWords(filteredWords, wordleWords, knownLetters);
  }, [filteredWords, knownLetters, showInfoMode]);

  // Calculate letter frequencies by position
  const positionFrequencies = useMemo(() => {
    const frequencies = [];
    
    for (let pos = 0; pos < 5; pos++) {
      const letterCounts = {};
      
      for (const word of filteredWords) {
        const letter = word[pos];
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
      }
      
      const total = filteredWords.length;
      const sorted = Object.entries(letterCounts)
        .map(([letter, count]) => ({
          letter: letter.toUpperCase(),
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      
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
    setShowSuggestions(false);
    setShowInfoMode(false);
  };

  const removeGuess = (index) => {
    setGuesses(guesses.filter((_, i) => i !== index));
  };

  const reset = () => {
    setGuesses([]);
    setCurrentWord('');
    setCurrentColors([GRAY, GRAY, GRAY, GRAY, GRAY]);
    setError('');
    setShowSuggestions(false);
    setShowInfoMode(false);
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

        {/* Strategic Suggestions - Collapsible */}
        {guesses.length > 0 && filteredWords.length > 1 && filteredWords.length <= 150 && (
          <div className="suggestions-section">
            <button 
              className="suggestions-toggle"
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <span className="toggle-icon">{showSuggestions ? '▼' : '▶'}</span>
              <span>🎯 Strategic Suggestions</span>
              <span className="toggle-hint">{showSuggestions ? 'hide' : 'could be the answer'}</span>
            </button>
            
            {showSuggestions && (
              <div className="suggestions-content">
                {bestGuesses.length === 0 ? (
                  <p className="calculating">Calculating...</p>
                ) : (
                  <>
                    <p className="suggestions-explainer">
                      Best guesses from remaining words (highest chance to win or eliminate):
                    </p>
                    <div className="suggestions-list">
                      {bestGuesses.map((guess, idx) => (
                        <div key={idx} className="suggestion-item">
                          <span className="suggestion-rank">#{idx + 1}</span>
                          <span className="suggestion-word">{guess.word.toUpperCase()}</span>
                          <span className="suggestion-stat">
                            eliminates ~{Math.round(guess.eliminationPct)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Info Gathering Mode - Collapsible */}
        {guesses.length > 0 && filteredWords.length > 2 && (
          <div className="suggestions-section info-mode">
            <button 
              className="suggestions-toggle"
              onClick={() => setShowInfoMode(!showInfoMode)}
            >
              <span className="toggle-icon">{showInfoMode ? '▼' : '▶'}</span>
              <span>🔍 Info Gathering Mode</span>
              <span className="toggle-hint">{showInfoMode ? 'hide' : 'test common letters'}</span>
            </button>
            
            {showInfoMode && (
              <div className="suggestions-content">
                {/* Common untested letters */}
                <div className="common-letters-section">
                  <p className="suggestions-explainer">
                    Most common untested letters in remaining words:
                  </p>
                  <div className="common-letters">
                    {commonLetters.slice(0, 10).map((item, idx) => (
                      <div key={idx} className="common-letter-item">
                        <span className="common-letter">{item.letter}</span>
                        <span className="common-letter-pct">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Words that test these letters */}
                {infoGatheringWords.length > 0 && (
                  <div className="info-words-section">
                    <p className="suggestions-explainer">
                      Words that test the most common letters:
                    </p>
                    <div className="suggestions-list">
                      {infoGatheringWords.map((item, idx) => (
                        <div key={idx} className={`suggestion-item ${item.couldBeAnswer ? 'is-answer' : ''}`}>
                          <span className="suggestion-rank">#{idx + 1}</span>
                          <span className="suggestion-word">{item.word.toUpperCase()}</span>
                          <span className="suggestion-stat">
                            tests {item.matchingLetters.join(', ')}
                          </span>
                          {item.couldBeAnswer && (
                            <span className="suggestion-badge">could be answer</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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

        /* Strategic Suggestions Section */
        .suggestions-section {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 16px;
          margin-bottom: 1rem;
          overflow: hidden;
        }

        .suggestions-section.info-mode {
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .suggestions-toggle {
          width: 100%;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: transparent;
          border: none;
          color: #e5e7eb;
          font-family: 'Outfit', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .suggestions-toggle:hover {
          background: rgba(99, 102, 241, 0.1);
        }

        .info-mode .suggestions-toggle:hover {
          background: rgba(245, 158, 11, 0.1);
        }

        .toggle-icon {
          font-size: 0.75rem;
          color: #6366f1;
        }

        .info-mode .toggle-icon {
          color: #f59e0b;
        }

        .toggle-hint {
          margin-left: auto;
          font-size: 0.85rem;
          font-weight: 400;
          color: #6b7280;
        }

        .suggestions-content {
          padding: 0 1.5rem 1.5rem 1.5rem;
        }

        .suggestions-explainer {
          font-size: 0.9rem;
          color: #9ca3af;
          margin-bottom: 1rem;
        }

        .calculating {
          color: #6b7280;
          font-style: italic;
        }

        .suggestions-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .suggestion-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          background: #111827;
          border-radius: 8px;
          border: 1px solid #1f2937;
          flex-wrap: wrap;
        }

        .suggestion-item.is-answer {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.05);
        }

        .suggestion-rank {
          font-family: 'Space Mono', monospace;
          font-size: 0.85rem;
          color: #6366f1;
          font-weight: 700;
        }

        .info-mode .suggestion-rank {
          color: #f59e0b;
        }

        .suggestion-word {
          font-family: 'Space Mono', monospace;
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          color: #e5e7eb;
        }

        .suggestion-stat {
          font-size: 0.85rem;
          color: #9ca3af;
        }

        .suggestion-badge {
          margin-left: auto;
          font-size: 0.75rem;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.15);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        /* Common Letters */
        .common-letters-section {
          margin-bottom: 1.5rem;
        }

        .common-letters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .common-letter-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.5rem 0.75rem;
          background: #111827;
          border-radius: 8px;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .common-letter {
          font-family: 'Space Mono', monospace;
          font-size: 1.25rem;
          font-weight: 700;
          color: #f59e0b;
        }

        .common-letter-pct {
          font-size: 0.7rem;
          color: #6b7280;
        }

        .info-words-section {
          margin-top: 1rem;
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
          
          .suggestion-item {
            gap: 0.5rem;
          }
          
          .suggestion-badge {
            margin-left: 0;
            margin-top: 0.5rem;
            width: 100%;
            text-align: center;
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
