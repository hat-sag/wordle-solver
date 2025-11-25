import { useState, useMemo } from 'react';
import Head from 'next/head';
import { wordleWords, extendedWords } from '../data/words';

// Color states
const GRAY = 'gray';
const YELLOW = 'yellow';
const GREEN = 'green';

// Helper: Given a guess and an answer, return the color pattern
function getColorPattern(guess, answer) {
  const pattern = ['gray', 'gray', 'gray', 'gray', 'gray'];
  const answerLetters = answer.split('');
  const guessLetters = guess.split('');
  
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === answerLetters[i]) {
      pattern[i] = 'green';
      answerLetters[i] = null;
      guessLetters[i] = null;
    }
  }
  
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

// Normalize a value between 0 and 1
function normalize(value, min, max) {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

// Get letter frequency weights from remaining words
function getLetterWeights(remainingWords) {
  const counts = {};
  for (const word of remainingWords) {
    const uniqueLetters = new Set(word.split(''));
    for (const letter of uniqueLetters) {
      counts[letter] = (counts[letter] || 0) + 1;
    }
  }
  return counts;
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

// DETECT PATTERN TRAP
function detectPatternTrap(remainingWords) {
  if (remainingWords.length < 2 || remainingWords.length > 20) {
    return { isTrapped: false };
  }

  const n = remainingWords.length;
  const lockedPositions = [];
  const variablePositions = [];
  const variableLettersByPosition = {};
  let patternString = '';

  for (let pos = 0; pos < 5; pos++) {
    const lettersAtPos = {};
    for (const word of remainingWords) {
      const letter = word[pos];
      lettersAtPos[letter] = (lettersAtPos[letter] || 0) + 1;
    }

    const uniqueLetters = Object.keys(lettersAtPos);
    const mostCommonCount = Math.max(...Object.values(lettersAtPos));

    if (mostCommonCount / n >= 0.8 && uniqueLetters.length <= 2) {
      const dominantLetter = Object.entries(lettersAtPos).find(([_, count]) => count === mostCommonCount)[0];
      lockedPositions.push(pos);
      patternString += dominantLetter.toUpperCase();
    } else {
      variablePositions.push(pos);
      variableLettersByPosition[pos] = uniqueLetters;
      patternString += '_';
    }
  }

  const isTrapped = lockedPositions.length >= 3 && variablePositions.length >= 1 && variablePositions.length <= 2;

  const variableLetters = new Set();
  for (const pos of variablePositions) {
    for (const letter of variableLettersByPosition[pos]) {
      variableLetters.add(letter);
    }
  }

  return {
    isTrapped,
    pattern: patternString,
    lockedPositions,
    variablePositions,
    variableLetters: [...variableLetters],
    variableLettersByPosition
  };
}

// Find probe words that test variable letters
function findPatternBreakerWords(remainingWords, allWords, patternInfo, knownLetters) {
  const { variableLetters } = patternInfo;
  
  if (variableLetters.length === 0) return [];

  const probeScores = [];

  for (const word of allWords) {
    if (remainingWords.includes(word)) continue;

    const uniqueLetters = new Set(word.split(''));
    const testedVariableLetters = variableLetters.filter(vl => uniqueLetters.has(vl));

    const minToTest = Math.min(2, variableLetters.length);
    if (testedVariableLetters.length >= minToTest) {
      const narrowsTo = Math.ceil(remainingWords.length / (testedVariableLetters.length + 1));

      probeScores.push({
        word,
        testedLetters: testedVariableLetters.map(l => l.toUpperCase()),
        testedCount: testedVariableLetters.length,
        narrowsTo,
        couldBeAnswer: false
      });
    }
  }

  probeScores.sort((a, b) => {
    if (b.testedCount !== a.testedCount) return b.testedCount - a.testedCount;
    return a.word.localeCompare(b.word);
  });

  return probeScores.slice(0, 5);
}

// THE BLENDED SMART SUGGESTIONS ALGORITHM
function calculateSmartSuggestions(remainingWords, allWords, guessCount, knownLetters, patternInfo) {
  const n = remainingWords.length;
  if (n <= 1) return { suggestions: [], patternBreakers: [] };
  if (n > 300) return { suggestions: [], patternBreakers: [] };

  const turn = guessCount + 1;

  let wElim = 1.0;
  let wAnswer = 0.3;
  let wCoverage = 0.4;
  let dupPenalty = 0.25;

  if (turn >= 3 && turn <= 4) {
    wElim = 0.8;
    wAnswer = 0.7;
    wCoverage = 0.3;
    dupPenalty = 0.15;
  } else if (turn >= 5) {
    wElim = 0.4;
    wAnswer = 1.0;
    wCoverage = 0.15;
    dupPenalty = 0.05;
  }

  const letterWeights = getLetterWeights(remainingWords);

  let candidates;
  if (n > 40) {
    const scored = allWords.map(word => {
      const uniqueLetters = new Set(word.split(''));
      let coverageScore = 0;
      for (const letter of uniqueLetters) {
        if (!knownLetters.has(letter)) {
          coverageScore += letterWeights[letter] || 0;
        }
      }
      return { 
        word, 
        coverageScore, 
        inRemaining: remainingWords.includes(word) 
      };
    });

    scored.sort((a, b) => {
      if (b.coverageScore !== a.coverageScore) return b.coverageScore - a.coverageScore;
      if (a.inRemaining !== b.inRemaining) return (b.inRemaining ? 1 : 0) - (a.inRemaining ? 1 : 0);
      return 0;
    });

    candidates = scored.slice(0, 120).map(s => s.word);
    
    for (const word of remainingWords) {
      if (!candidates.includes(word)) {
        candidates.push(word);
      }
    }
  } else {
    candidates = [...remainingWords];
  }

  const guessScoresRaw = [];

  for (const guess of candidates) {
    const patternBuckets = {};

    for (const answer of remainingWords) {
      const pattern = getColorPattern(guess, answer);
      patternBuckets[pattern] = (patternBuckets[pattern] || 0) + 1;
    }

    const bucketSizes = Object.values(patternBuckets);
    const expectedRemaining = bucketSizes.reduce((sum, size) => sum + (size * size), 0) / n;
    const elimFraction = (n - expectedRemaining) / n;

    const inRemaining = remainingWords.includes(guess);
    const answerProb = inRemaining ? 1 / n : 0;

    const uniqueLetters = [...new Set(guess.split(''))];
    let coverageScore = 0;
    for (const letter of uniqueLetters) {
      if (!knownLetters.has(letter)) {
        coverageScore += letterWeights[letter] || 0;
      }
    }

    const hasDuplicate = uniqueLetters.length < 5;
    const dupPenaltyApplied = hasDuplicate ? dupPenalty : 0;

    guessScoresRaw.push({
      word: guess,
      expectedRemaining,
      elimFraction,
      answerProb,
      coverageScore,
      inRemaining,
      hasDuplicate,
      dupPenaltyApplied
    });
  }

  const minCov = Math.min(...guessScoresRaw.map(g => g.coverageScore));
  const maxCov = Math.max(...guessScoresRaw.map(g => g.coverageScore));

  const guessScores = guessScoresRaw.map(g => {
    const elimComponent = g.elimFraction;
    const coverageComponent = normalize(g.coverageScore, minCov, maxCov);
    const answerComponent = g.answerProb * n;

    const blendedScore =
      wElim * elimComponent +
      wCoverage * coverageComponent +
      wAnswer * answerComponent -
      g.dupPenaltyApplied;

    return {
      word: g.word,
      blendedScore,
      expectedRemaining: g.expectedRemaining,
      eliminationPct: Math.round(g.elimFraction * 100),
      answerProbPct: Math.round(g.answerProb * 100),
      coverageScore: g.coverageScore,
      couldBeAnswer: g.inRemaining,
      hasDuplicate: g.hasDuplicate
    };
  });

  guessScores.sort((a, b) => b.blendedScore - a.blendedScore);

  let patternBreakers = [];
  if (patternInfo.isTrapped) {
    patternBreakers = findPatternBreakerWords(remainingWords, allWords, patternInfo, knownLetters);
  }

  return {
    suggestions: guessScores.slice(0, 10),
    patternBreakers
  };
}

// Filter function that works on any word list
function filterWordList(words, guesses) {
  let filtered = [...words];
  
  for (const guess of guesses) {
    const { word, colors } = guess;
    
    filtered = filtered.filter(candidate => {
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
  
  return filtered;
}

export default function Home() {
  const [guesses, setGuesses] = useState([]);
  const [currentWord, setCurrentWord] = useState('');
  const [currentColors, setCurrentColors] = useState([GRAY, GRAY, GRAY, GRAY, GRAY]);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filter primary word list
  const filteredWords = useMemo(() => filterWordList(wordleWords, guesses), [guesses]);
  
  // Filter extended word list (fallback)
  const filteredExtended = useMemo(() => {
    if (filteredWords.length > 0 || extendedWords.length === 0) return [];
    return filterWordList(extendedWords, guesses);
  }, [guesses, filteredWords.length]);

  // Use extended list if primary is empty
  const usingExtended = filteredWords.length === 0 && filteredExtended.length > 0;
  const displayWords = usingExtended ? filteredExtended : filteredWords;

  // Get letters we've already tested
  const knownLetters = useMemo(() => getKnownLetters(guesses), [guesses]);

  // Detect pattern trap
  const patternInfo = useMemo(() => detectPatternTrap(displayWords), [displayWords]);

  // Calculate smart suggestions (blended algorithm)
  const { suggestions: smartSuggestions, patternBreakers } = useMemo(() => {
    if (!showSuggestions) return { suggestions: [], patternBreakers: [] };
    return calculateSmartSuggestions(displayWords, wordleWords, guesses.length, knownLetters, patternInfo);
  }, [displayWords, showSuggestions, guesses.length, knownLetters, patternInfo]);

  // Calculate letter frequencies by position
  const positionFrequencies = useMemo(() => {
    const frequencies = [];
    
    for (let pos = 0; pos < 5; pos++) {
      const letterCounts = {};
      
      for (const word of displayWords) {
        const letter = word[pos];
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
      }
      
      const total = displayWords.length;
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
  }, [displayWords]);

  // Determine game phase for display
  const gamePhase = useMemo(() => {
    const turn = guesses.length + 1;
    if (turn <= 2) return { name: 'Early Game', desc: 'Prioritizing information gathering', color: '#f59e0b' };
    if (turn <= 4) return { name: 'Mid Game', desc: 'Balancing info and solving', color: '#8b5cf6' };
    return { name: 'Late Game', desc: 'Prioritizing the win', color: '#22c55e' };
  }, [guesses.length]);

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
            <span className="word-count">{displayWords.length} remaining</span>
          </div>

          {/* Extended list notice */}
          {usingExtended && (
            <div className="extended-notice">
              ⚠️ No common words match — showing all valid Wordle words
            </div>
          )}

          {displayWords.length === 0 ? (
            <div className="no-words">
              <p>No words match your criteria. Check your inputs!</p>
              <p className="no-words-hint">The word might be a newer NYT addition not in our list yet.</p>
            </div>
          ) : displayWords.length <= 50 ? (
            <div className="word-grid">
              {displayWords.map((word, idx) => (
                <div key={idx} className="word-item">{word}</div>
              ))}
            </div>
          ) : (
            <p className="too-many">Showing letter frequencies below. Add more guesses to narrow down.</p>
          )}
        </div>

        {/* Smart Suggestions */}
        {guesses.length > 0 && displayWords.length > 1 && displayWords.length <= 300 && (
          <div className="suggestions-section">
            <button 
              className="suggestions-toggle"
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <span className="toggle-icon">{showSuggestions ? '▼' : '▶'}</span>
              <span>🧠 Smart Suggestions</span>
              <span className="toggle-hint">{showSuggestions ? 'hide' : 'show optimal plays'}</span>
            </button>
            
            {showSuggestions && (
              <div className="suggestions-content">
                {/* Game Phase Indicator */}
                <div className="phase-indicator" style={{ borderColor: gamePhase.color }}>
                  <span className="phase-name" style={{ color: gamePhase.color }}>{gamePhase.name}</span>
                  <span className="phase-desc">{gamePhase.desc}</span>
                </div>

                {/* Pattern Trap Alert */}
                {patternInfo.isTrapped && (
                  <div className="pattern-alert">
                    <div className="pattern-header">
                      <span className="pattern-icon">⚠️</span>
                      <span className="pattern-title">Pattern trap detected</span>
                    </div>
                    <div className="pattern-details">
                      <span className="pattern-string">{patternInfo.pattern}</span>
                      <span className="pattern-varying">
                        varying: {patternInfo.variableLetters.map(l => l.toUpperCase()).join(', ')}
                      </span>
                    </div>
                    
                    {patternBreakers.length > 0 && (
                      <div className="pattern-breakers">
                        <p className="breakers-label">Test multiple letters at once:</p>
                        {patternBreakers.map((breaker, idx) => (
                          <div key={idx} className="breaker-item">
                            <span className="breaker-word">{breaker.word.toUpperCase()}</span>
                            <span className="breaker-tests">
                              tests {breaker.testedLetters.join(', ')}
                            </span>
                            <span className="breaker-narrows">
                              → narrows to ~{breaker.narrowsTo}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Regular Suggestions */}
                {smartSuggestions.length === 0 ? (
                  <p className="calculating">Calculating...</p>
                ) : (
                  <div className="suggestions-list">
                    {smartSuggestions.map((guess, idx) => (
                      <div key={idx} className={`suggestion-item ${guess.couldBeAnswer ? 'is-answer' : 'is-probe'}`}>
                        <span className="suggestion-rank">#{idx + 1}</span>
                        <span className="suggestion-word">{guess.word.toUpperCase()}</span>
                        <div className="suggestion-stats">
                          <span className="stat-elim">eliminates ~{guess.eliminationPct}%</span>
                          {guess.couldBeAnswer ? (
                            <span className="stat-answer">
                              {displayWords.length <= 10 
                                ? `1 in ${displayWords.length} chance`
                                : `${guess.answerProbPct > 0 ? guess.answerProbPct : '<1'}% to win`
                              }
                            </span>
                          ) : (
                            <span className="stat-probe">probe word</span>
                          )}
                        </div>
                        {guess.couldBeAnswer && (
                          <span className="badge badge-answer">✓ could be answer</span>
                        )}
                        {!guess.couldBeAnswer && (
                          <span className="badge badge-probe">info only</span>
                        )}
                      </div>
                    ))}
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

        .extended-notice {
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
          font-size: 0.9rem;
          color: #fbbf24;
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

        .no-words {
          color: #9ca3af;
        }

        .no-words p {
          margin-bottom: 0.5rem;
        }

        .no-words-hint {
          font-size: 0.85rem;
          font-style: italic;
          color: #6b7280;
        }

        .too-many {
          color: #9ca3af;
          font-style: italic;
        }

        .suggestions-section {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 16px;
          margin-bottom: 2rem;
          overflow: hidden;
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
          background: rgba(99, 102, 241, 0.15);
        }

        .toggle-icon {
          font-size: 0.75rem;
          color: #8b5cf6;
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

        .phase-indicator {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          border-left: 3px solid;
          margin-bottom: 1rem;
        }

        .phase-name {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .phase-desc {
          font-size: 0.85rem;
          color: #9ca3af;
        }

        .pattern-alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .pattern-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .pattern-icon {
          font-size: 1.1rem;
        }

        .pattern-title {
          font-weight: 600;
          color: #fca5a5;
        }

        .pattern-details {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .pattern-string {
          font-family: 'Space Mono', monospace;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          color: #ef4444;
        }

        .pattern-varying {
          font-size: 0.85rem;
          color: #9ca3af;
        }

        .pattern-breakers {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 0.75rem;
        }

        .breakers-label {
          font-size: 0.8rem;
          color: #9ca3af;
          margin-bottom: 0.5rem;
        }

        .breaker-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .breaker-item:last-child {
          border-bottom: none;
        }

        .breaker-word {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.1em;
          color: #fbbf24;
          min-width: 70px;
        }

        .breaker-tests {
          font-size: 0.85rem;
          color: #d1d5db;
        }

        .breaker-narrows {
          font-size: 0.8rem;
          color: #22c55e;
          margin-left: auto;
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
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(17, 24, 39, 1) 100%);
        }

        .suggestion-item.is-probe {
          border-color: rgba(245, 158, 11, 0.4);
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(17, 24, 39, 1) 100%);
        }

        .suggestion-rank {
          font-family: 'Space Mono', monospace;
          font-size: 0.85rem;
          color: #8b5cf6;
          font-weight: 700;
          min-width: 28px;
        }

        .suggestion-word {
          font-family: 'Space Mono', monospace;
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          color: #e5e7eb;
          min-width: 80px;
        }

        .suggestion-stats {
          display: flex;
          gap: 1rem;
          flex: 1;
        }

        .stat-elim {
          font-size: 0.85rem;
          color: #9ca3af;
        }

        .stat-answer {
          font-size: 0.85rem;
          color: #22c55e;
        }

        .stat-probe {
          font-size: 0.85rem;
          color: #f59e0b;
          font-style: italic;
        }

        .badge {
          font-size: 0.7rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .badge-answer {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .badge-probe {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }

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
          
          .suggestion-stats {
            width: 100%;
            order: 3;
          }
          
          .badge {
            order: 4;
          }

          .pattern-details {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }

          .breaker-item {
            flex-wrap: wrap;
          }

          .breaker-narrows {
            width: 100%;
            margin-left: 0;
            margin-top: 0.25rem;
          }
        }

        @media (max-width: 480px) {
          .freq-grid {
            grid-template-columns: 1fr;
          }
          
          h1 {
            font-size: 1.75rem;
            letter-spacing: 0.15em;
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
