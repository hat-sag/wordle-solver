import { useState, useMemo, useRef, useCallback } from 'react';
import Head from 'next/head';
import { wordleWords, extendedWords } from '../data/words';
import {
  GRAY,
  YELLOW,
  GREEN,
  filterWordList,
  detectPatternTrap,
  getRecommendations
} from '../lib/solver';

// Above this many candidates the recommendation math stops being interesting —
// almost anything eliminates a lot, so we just show letter frequencies instead.
const MAX_CANDIDATES_FOR_ADVICE = 300;

export default function Home() {
  const [guesses, setGuesses] = useState([]);
  const [currentWord, setCurrentWord] = useState('');
  const [currentColors, setCurrentColors] = useState([GRAY, GRAY, GRAY, GRAY, GRAY]);
  const [error, setError] = useState('');
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  // AI fallback state, used only when the word bank has run dry.
  const [aiWords, setAiWords] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const inputRef = useRef(null);

  const filteredWords = useMemo(() => filterWordList(wordleWords, guesses), [guesses]);

  const filteredExtended = useMemo(() => {
    if (filteredWords.length > 0 || !extendedWords || extendedWords.length === 0) return [];
    return filterWordList(extendedWords, guesses);
  }, [guesses, filteredWords.length]);

  const usingExtended = filteredWords.length === 0 && filteredExtended.length > 0;
  const displayWords = usingExtended ? filteredExtended : filteredWords;

  const patternInfo = useMemo(() => detectPatternTrap(displayWords), [displayWords]);

  const advice = useMemo(() => {
    if (
      guesses.length === 0 ||
      displayWords.length <= 1 ||
      displayWords.length > MAX_CANDIDATES_FOR_ADVICE
    ) {
      return null;
    }
    return getRecommendations(displayWords, wordleWords);
  }, [displayWords, guesses.length]);

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

  // Drop any recommended (or listed) word straight into the input, ready for
  // colouring. Same idea as the SALET shortcut, just for every word on screen.
  const useWord = useCallback((word) => {
    setCurrentWord(word.toLowerCase());
    setCurrentColors([GRAY, GRAY, GRAY, GRAY, GRAY]);
    setError('');
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const addGuess = () => {
    if (currentWord.length !== 5) {
      setError('Enter a 5-letter word');
      return;
    }

    setGuesses([...guesses, { word: currentWord, colors: currentColors }]);
    setCurrentWord('');
    setCurrentColors([GRAY, GRAY, GRAY, GRAY, GRAY]);
    setError('');
    setShowAllSuggestions(false);
    setAiWords(null);
    setAiError('');
  };

  const removeGuess = (index) => {
    setGuesses(guesses.filter((_, i) => i !== index));
    setAiWords(null);
    setAiError('');
  };

  const reset = () => {
    setGuesses([]);
    setCurrentWord('');
    setCurrentColors([GRAY, GRAY, GRAY, GRAY, GRAY]);
    setError('');
    setShowAllSuggestions(false);
    setAiWords(null);
    setAiError('');
  };

  const askAI = async () => {
    setAiLoading(true);
    setAiError('');
    setAiWords(null);
    try {
      const res = await fetch('/api/suggest-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guesses })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setAiWords(data.words || []);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const getColorClass = (color) => {
    if (color === GREEN) return 'tile-green';
    if (color === YELLOW) return 'tile-yellow';
    return 'tile-gray';
  };

  const verdict = advice?.verdict;

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
              ref={inputRef}
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
            {guesses.length === 0 && currentWord === '' && (
              <button className="btn btn-ghost" onClick={() => useWord('salet')}>
                Start with SALET
              </button>
            )}
          </div>
        </div>

        {/* Recommendations: answer vs probe, side by side */}
        {advice && advice.bestAnswer && advice.bestProbe && (
          <div className="advice-section">
            <div className="advice-head">
              <h2>Recommended Next Guess</h2>
              <span className="advice-sub">
                {displayWords.length} candidates · up to {advice.maxBits.toFixed(1)} bits to gain
              </span>
            </div>

            {/* Pattern trap explains *why* a probe is often right here */}
            {patternInfo.isTrapped && (
              <div className="trap-note">
                <span className="trap-pattern">{patternInfo.pattern}</span>
                <span className="trap-text">
                  Pattern trap — only{' '}
                  <strong>{patternInfo.variableLetters.map(l => l.toUpperCase()).join(', ')}</strong>{' '}
                  are still in question. Guessing candidates one at a time tests one letter per turn.
                </span>
              </div>
            )}

            <div className="pick-grid">
              <RecommendationCard
                kind="answer"
                label="Best Answer Guess"
                blurb="Could win this turn"
                pick={advice.bestAnswer}
                recommended={verdict?.pick === 'answer'}
                total={displayWords.length}
                onUse={useWord}
              />
              <RecommendationCard
                kind="probe"
                label="Best Probe Guess"
                blurb="Can't win — buys information"
                pick={advice.bestProbe}
                recommended={verdict?.pick === 'probe'}
                total={displayWords.length}
                onUse={useWord}
              />
            </div>

            {verdict && (
              <div className={`verdict verdict-${verdict.pick}`}>
                <div className="verdict-top">
                  <span className="verdict-badge">{verdict.headline}</span>
                  <span className="verdict-math">
                    {advice.bestAnswer.word.toUpperCase()} {advice.bestAnswer.expTurns.toFixed(2)} turns
                    {'  vs  '}
                    {advice.bestProbe.word.toUpperCase()} {advice.bestProbe.expTurns.toFixed(2)} turns
                  </span>
                </div>
                <p className="verdict-detail">{verdict.detail}</p>
              </div>
            )}

            <button
              className="more-toggle"
              onClick={() => setShowAllSuggestions(!showAllSuggestions)}
            >
              {showAllSuggestions ? '▼ hide runners-up' : '▶ show runners-up'}
            </button>

            {showAllSuggestions && (
              <div className="runners-grid">
                <RunnerUpList
                  title="Other answer guesses"
                  kind="answer"
                  items={advice.answers.slice(1)}
                  onUse={useWord}
                />
                <RunnerUpList
                  title="Other probes"
                  kind="probe"
                  items={advice.probes.slice(1)}
                  onUse={useWord}
                />
              </div>
            )}
          </div>
        )}

        {/* Results */}
        <div className="results-section">
          <div className="results-header">
            <h2>Possible Words</h2>
            <span className="word-count">{displayWords.length} remaining</span>
          </div>

          {usingExtended && (
            <div className="extended-notice">
              ⚠️ No common words match — showing all valid Wordle words
            </div>
          )}

          {displayWords.length === 0 ? (
            <div className="no-words">
              <p>No words match your criteria.</p>
              <p className="no-words-hint">
                Either a color is marked wrong, or today&apos;s answer is a newer NYT word that
                isn&apos;t in our bank yet.
              </p>

              <div className="ai-block">
                <button className="btn btn-ai" onClick={askAI} disabled={aiLoading}>
                  {aiLoading ? 'Thinking…' : '✨ Ask AI for the missing word'}
                </button>
                <p className="ai-hint">
                  Sends just your guesses and colors to Claude, which knows words our bank
                  doesn&apos;t.
                </p>

                {aiError && <p className="error">{aiError}</p>}

                {aiWords && aiWords.length === 0 && (
                  <p className="ai-empty">Claude couldn&apos;t find a word fitting all those clues either — worth double-checking your tile colors.</p>
                )}

                {aiWords && aiWords.length > 0 && (
                  <div className="ai-results">
                    {aiWords.map((item, idx) => (
                      <button
                        key={idx}
                        className="ai-word"
                        onClick={() => useWord(item.word)}
                        title="Click to use this word"
                      >
                        <span className="ai-word-text">{item.word.toUpperCase()}</span>
                        <span className="ai-word-reason">{item.reason}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : displayWords.length <= 50 ? (
            <div className="word-grid">
              {displayWords.map((word, idx) => (
                <button
                  key={idx}
                  className="word-item"
                  onClick={() => useWord(word)}
                  title="Click to use this word"
                >
                  {word}
                </button>
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
                        <div className="freq-bar" style={{ width: `${percentage}%` }}></div>
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
          flex-wrap: wrap;
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

        .btn-ghost {
          background: transparent;
          color: #6b7280;
          border: 1px dashed #4b5563;
          font-size: 0.9rem;
          padding: 0.6rem 1rem;
        }

        .btn-ghost:hover {
          color: #9ca3af;
          border-color: #6b7280;
        }

        /* --- Recommendations --- */

        .advice-section {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .advice-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .advice-head h2 {
          margin-bottom: 0;
          color: #c7d2fe;
        }

        .advice-sub {
          font-family: 'Space Mono', monospace;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .trap-note {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
        }

        .trap-pattern {
          font-family: 'Space Mono', monospace;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          color: #f87171;
          white-space: nowrap;
        }

        .trap-text {
          font-size: 0.85rem;
          color: #d1d5db;
          line-height: 1.45;
        }

        .trap-text strong {
          color: #fca5a5;
        }

        .pick-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .verdict {
          border-radius: 12px;
          padding: 0.9rem 1.1rem;
          border-left: 3px solid;
          background: rgba(0, 0, 0, 0.35);
        }

        .verdict-answer {
          border-color: #22c55e;
        }

        .verdict-probe {
          border-color: #f59e0b;
        }

        .verdict-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 0.4rem;
        }

        .verdict-badge {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #e5e7eb;
        }

        .verdict-math {
          font-family: 'Space Mono', monospace;
          font-size: 0.72rem;
          color: #6b7280;
          white-space: pre;
        }

        .verdict-detail {
          font-size: 0.87rem;
          color: #9ca3af;
          line-height: 1.5;
        }

        .more-toggle {
          margin-top: 1rem;
          background: transparent;
          border: none;
          color: #8b5cf6;
          font-family: 'Outfit', sans-serif;
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0;
        }

        .more-toggle:hover {
          color: #a78bfa;
        }

        .runners-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-top: 0.75rem;
        }

        /* --- Results --- */

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
          border: 1px solid #1f2937;
          color: #e5e7eb;
          border-radius: 6px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
        }

        .word-item:hover {
          border-color: #6366f1;
          color: #c7d2fe;
          transform: translateY(-1px);
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

        .ai-block {
          margin-top: 1.25rem;
          padding-top: 1.25rem;
          border-top: 1px solid #374151;
        }

        .btn-ai {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
        }

        .btn-ai:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
        }

        .btn-ai:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .ai-hint {
          font-size: 0.8rem;
          color: #6b7280;
          margin-top: 0.6rem;
        }

        .ai-empty {
          font-size: 0.85rem;
          color: #9ca3af;
          margin-top: 0.75rem;
        }

        .ai-results {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .ai-word {
          display: flex;
          align-items: baseline;
          gap: 0.9rem;
          text-align: left;
          width: 100%;
          padding: 0.7rem 0.9rem;
          background: #111827;
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 8px;
          cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: all 0.15s;
        }

        .ai-word:hover {
          border-color: #8b5cf6;
          transform: translateY(-1px);
        }

        .ai-word-text {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.15em;
          color: #c4b5fd;
          min-width: 80px;
        }

        .ai-word-reason {
          font-size: 0.82rem;
          color: #9ca3af;
          line-height: 1.4;
        }

        .too-many {
          color: #9ca3af;
          font-style: italic;
        }

        /* --- Frequencies --- */

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

        @media (max-width: 768px) {
          .freq-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .pick-grid,
          .runners-grid {
            grid-template-columns: 1fr;
          }

          .trap-note {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.4rem;
          }

          .verdict-math {
            white-space: normal;
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
      `}</style>
    </>
  );
}

// One of the two headline picks. The whole card is the button — clicking it
// loads the word into the input.
function RecommendationCard({ kind, label, blurb, pick, recommended, total, onUse }) {
  const winChance = kind === 'answer' ? 1 / total : 0;

  return (
    <button
      className={`pick pick-${kind} ${recommended ? 'is-recommended' : ''}`}
      onClick={() => onUse(pick.word)}
      title="Click to load this word into the input"
    >
      <div className="pick-head">
        <span className="pick-label">{label}</span>
        {recommended && <span className="pick-flag">recommended</span>}
      </div>

      <div className="pick-word">{pick.word.toUpperCase()}</div>
      <div className="pick-blurb">{blurb}</div>

      <div className="pick-stats">
        <div className="stat">
          <span className="stat-value">{pick.bits.toFixed(2)}</span>
          <span className="stat-key">bits gained</span>
        </div>
        <div className="stat">
          <span className="stat-value">{pick.expTurns.toFixed(2)}</span>
          <span className="stat-key">exp. turns</span>
        </div>
        <div className="stat">
          <span className="stat-value">{pick.worst}</span>
          <span className="stat-key">worst case left</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {kind === 'answer'
              ? winChance >= 0.01
                ? `${Math.round(winChance * 100)}%`
                : '<1%'
              : '—'}
          </span>
          <span className="stat-key">win now</span>
        </div>
      </div>

      <span className="pick-cta">click to use →</span>

      <style jsx>{`
        .pick {
          display: block;
          width: 100%;
          text-align: left;
          padding: 1rem 1.1rem;
          border-radius: 12px;
          background: #111827;
          border: 1px solid #1f2937;
          cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: all 0.15s;
        }

        .pick-answer {
          border-color: rgba(34, 197, 94, 0.35);
        }

        .pick-probe {
          border-color: rgba(245, 158, 11, 0.35);
        }

        .pick:hover {
          transform: translateY(-2px);
        }

        .pick-answer:hover {
          border-color: #22c55e;
          box-shadow: 0 4px 14px rgba(34, 197, 94, 0.15);
        }

        .pick-probe:hover {
          border-color: #f59e0b;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.15);
        }

        .pick-answer.is-recommended {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.14) 0%, rgba(17, 24, 39, 1) 70%);
          border-color: #22c55e;
        }

        .pick-probe.is-recommended {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(17, 24, 39, 1) 70%);
          border-color: #f59e0b;
        }

        .pick-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.6rem;
        }

        .pick-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #9ca3af;
        }

        .pick-flag {
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0.18rem 0.45rem;
          border-radius: 4px;
          background: ${kind === 'answer' ? 'rgba(34, 197, 94, 0.22)' : 'rgba(245, 158, 11, 0.22)'};
          color: ${kind === 'answer' ? '#22c55e' : '#f59e0b'};
          white-space: nowrap;
        }

        .pick-word {
          font-family: 'Space Mono', monospace;
          font-size: 1.7rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          color: ${kind === 'answer' ? '#dcfce7' : '#fef3c7'};
          line-height: 1.1;
        }

        .pick-blurb {
          font-size: 0.78rem;
          color: #6b7280;
          margin-top: 0.15rem;
          margin-bottom: 0.85rem;
        }

        .pick-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #1f2937;
        }

        .stat {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-family: 'Space Mono', monospace;
          font-size: 0.95rem;
          font-weight: 700;
          color: #e5e7eb;
        }

        .stat-key {
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
        }

        .pick-cta {
          display: block;
          margin-top: 0.85rem;
          font-size: 0.72rem;
          color: ${kind === 'answer' ? '#22c55e' : '#f59e0b'};
          opacity: 0.75;
        }
      `}</style>
    </button>
  );
}

function RunnerUpList({ title, kind, items, onUse }) {
  return (
    <div className="runners">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="runners-empty">Nothing else close.</p>
      ) : (
        items.map((item, idx) => (
          <button key={idx} className="runner" onClick={() => onUse(item.word)}>
            <span className="runner-word">{item.word.toUpperCase()}</span>
            <span className="runner-stats">
              {item.bits.toFixed(2)} bits · {item.expTurns.toFixed(2)} turns · worst {item.worst}
            </span>
          </button>
        ))
      )}

      <style jsx>{`
        .runners {
          background: rgba(0, 0, 0, 0.25);
          border-radius: 10px;
          padding: 0.85rem;
        }

        h3 {
          font-family: 'Space Mono', monospace;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #6b7280;
          margin-bottom: 0.6rem;
        }

        .runners-empty {
          font-size: 0.8rem;
          color: #4b5563;
          font-style: italic;
        }

        .runner {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem;
          width: 100%;
          padding: 0.45rem 0.55rem;
          margin-bottom: 0.25rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: all 0.12s;
        }

        .runner:hover {
          background: #111827;
          border-color: ${kind === 'answer' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)'};
        }

        .runner-word {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 0.88rem;
          letter-spacing: 0.12em;
          color: ${kind === 'answer' ? '#86efac' : '#fcd34d'};
        }

        .runner-stats {
          font-family: 'Space Mono', monospace;
          font-size: 0.66rem;
          color: #6b7280;
          text-align: right;
        }
      `}</style>
    </div>
  );
}
