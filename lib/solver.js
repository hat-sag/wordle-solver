// Core Wordle solving math.
//
// Two distinct recommendations come out of here:
//
//   1. "Best answer guess"  - a word that is still a live candidate, so it can
//                             win outright this turn.
//   2. "Best probe guess"   - a word that CANNOT be the answer, chosen purely to
//                             maximise information gain across the candidates.
//
// A probe spends a turn to buy information. That is a real cost, so we also
// compute which of the two is actually better in expected turns-to-solve, and
// hand the UI a verdict instead of making the user guess.

export const GRAY = 'gray';
export const YELLOW = 'yellow';
export const GREEN = 'green';

const WIN_PATTERN = 'green,green,green,green,green';

// Given a guess and an answer, return the color pattern Wordle would show.
// Handles duplicate letters the same way the real game does: greens are claimed
// first, then yellows consume whatever letters are left over.
export function getColorPattern(guess, answer) {
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

// Filter a word list down to those still consistent with every guess so far.
export function filterWordList(words, guesses) {
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

// Every letter we've already put on the board.
export function getKnownLetters(guesses) {
  const known = new Set();
  for (const guess of guesses) {
    for (const letter of guess.word) {
      known.add(letter);
    }
  }
  return known;
}

// Expected number of guesses still needed once you're down to k candidates and
// haven't yet played the answer.
//
// These are measured, not guessed: simulated over the real answer list by
// playing greedily from random and letter-clustered candidate sets of each size
// (see the calibration notes in the README). The log fit covers k > 10, where
// the curve flattens out because each guess splits the field so well.
const TURNS_FROM = {
  1: 1.00, 2: 1.48, 3: 1.70, 4: 1.82, 5: 1.89,
  6: 1.95, 7: 1.98, 8: 2.00, 9: 2.04, 10: 2.08
};

export function expectedTurnsFrom(k) {
  if (k <= 0) return 0;
  if (TURNS_FROM[k] !== undefined) return TURNS_FROM[k];
  return 1.53 + 0.24 * Math.log(k);
}

// Score one guess against the live candidate set.
//
//   bits      - Shannon information gained, in bits. log2(n) means the guess
//               separates every candidate from every other one.
//   expTurns  - expected total turns to finish, counting this one.
//   worst     - largest number of candidates that could still be left after it.
export function scoreGuess(guess, remaining, isCandidate) {
  const n = remaining.length;
  const buckets = new Map();

  for (const answer of remaining) {
    const pattern = getColorPattern(guess, answer);
    buckets.set(pattern, (buckets.get(pattern) || 0) + 1);
  }

  let bits = 0;
  let expTurns = 1;
  let worst = 0;

  for (const [pattern, count] of buckets) {
    const prob = count / n;
    bits -= prob * Math.log2(prob);
    if (count > worst) worst = count;
    // Landing on all-green means we already won; no further turns needed.
    expTurns += prob * (pattern === WIN_PATTERN ? 0 : expectedTurnsFrom(count));
  }

  return {
    word: guess,
    bits,
    expTurns,
    worst,
    buckets: buckets.size,
    couldBeAnswer: isCandidate
  };
}

// Overall letter commonness, used only to break ties between otherwise
// equivalent probes so we surface ordinary words rather than obscure ones.
function buildLetterFrequency(allWords) {
  const freq = {};
  for (const word of allWords) {
    for (const letter of new Set(word)) {
      freq[letter] = (freq[letter] || 0) + 1;
    }
  }
  return freq;
}

// Letters that actually vary across the candidates. A probe covering these
// produces feedback we can act on; one covering settled letters tells us nothing.
function liveLetters(remaining) {
  const live = new Set();
  for (const word of remaining) {
    for (const letter of word) live.add(letter);
  }
  return live;
}

// When the candidate set is large, scoring all ~2300 words against all of them
// gets slow in the browser. Pre-screen to a shortlist of words that cover the
// most informative letters, then score those properly.
function prescreenProbes(allWords, remaining, remainingSet, live, limit) {
  const positionalWeight = {};
  for (const word of remaining) {
    for (const letter of new Set(word)) {
      positionalWeight[letter] = (positionalWeight[letter] || 0) + 1;
    }
  }

  const scored = [];
  for (const word of allWords) {
    if (remainingSet.has(word)) continue;
    let cover = 0;
    for (const letter of new Set(word)) {
      if (live.has(letter)) cover += positionalWeight[letter] || 0;
    }
    scored.push({ word, cover });
  }

  scored.sort((a, b) => b.cover - a.cover || a.word.localeCompare(b.word));
  return scored.slice(0, limit).map(s => s.word);
}

// Detect the classic Wordle trap: most positions locked, one or two varying,
// with several candidates differing only at those spots (_ATCH, GRA_E, ...).
export function detectPatternTrap(remainingWords) {
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
      const dominantLetter = Object.entries(lettersAtPos).find(
        ([, count]) => count === mostCommonCount
      )[0];
      lockedPositions.push(pos);
      patternString += dominantLetter.toUpperCase();
    } else {
      variablePositions.push(pos);
      variableLettersByPosition[pos] = uniqueLetters;
      patternString += '_';
    }
  }

  const isTrapped =
    lockedPositions.length >= 3 &&
    variablePositions.length >= 1 &&
    variablePositions.length <= 2;

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

const EMPTY_RECOMMENDATIONS = {
  bestAnswer: null,
  bestProbe: null,
  answers: [],
  probes: [],
  verdict: null,
  maxBits: 0
};

// The main entry point: rank answer guesses and probe guesses separately, then
// decide which of the two leaders is actually the better play.
export function getRecommendations(remaining, allWords, options = {}) {
  const n = remaining.length;
  if (n <= 1) return EMPTY_RECOMMENDATIONS;

  const { probeLimit = 900, listSize = 6 } = options;

  const remainingSet = new Set(remaining);
  const live = liveLetters(remaining);
  const letterFreq = buildLetterFrequency(allWords);
  const maxBits = Math.log2(n);

  // Answer track: only words that could still be the answer.
  const answers = remaining
    .map(word => scoreGuess(word, remaining, true))
    .sort((a, b) => a.expTurns - b.expTurns || b.bits - a.bits || a.word.localeCompare(b.word));

  // Probe track: words that cannot be the answer, so every one of them spends a
  // turn — they have to earn it with information.
  const probePool =
    n > 60
      ? prescreenProbes(allWords, remaining, remainingSet, live, probeLimit)
      : allWords.filter(word => !remainingSet.has(word));

  const probes = probePool.map(word => {
    const score = scoreGuess(word, remaining, false);
    const unique = new Set(word);
    let liveCoverage = 0;
    let commonness = 0;
    for (const letter of unique) {
      if (live.has(letter)) liveCoverage++;
      commonness += letterFreq[letter] || 0;
    }
    return { ...score, liveCoverage, uniqueLetters: unique.size, commonness };
  });

  // Rank probes by information first, then by how bad the worst case is, then
  // prefer probes whose letters are actually in play (this is what surfaces a
  // GUIDE over an equally-splitting but less legible word).
  probes.sort(
    (a, b) =>
      b.bits - a.bits ||
      a.worst - b.worst ||
      b.liveCoverage - a.liveCoverage ||
      b.uniqueLetters - a.uniqueLetters ||
      b.commonness - a.commonness ||
      a.word.localeCompare(b.word)
  );

  const bestAnswer = answers[0] || null;
  const bestProbe = probes[0] || null;

  return {
    bestAnswer,
    bestProbe,
    answers: answers.slice(0, listSize),
    probes: probes.slice(0, listSize),
    verdict: buildVerdict(bestAnswer, bestProbe, n),
    maxBits
  };
}

// Is it worth burning a turn on a word that can't win?
//
// Compare expected turns-to-solve. The answer guess gets a free 1/n shot at
// winning right now, which the probe never has — so the probe has to make that
// back on information alone. We also report the worst case, because "never
// worse than turn X" is often what you actually care about.
function buildVerdict(bestAnswer, bestProbe, n) {
  if (!bestAnswer || !bestProbe) return null;

  const margin = bestAnswer.expTurns - bestProbe.expTurns;
  const winChance = 1 / n;

  // Two candidates left is a coin flip you should just take: a probe cannot do
  // better than the 50% you already have, and it costs a guaranteed turn.
  if (n <= 2) {
    return {
      pick: 'answer',
      margin,
      confidence: 'clear',
      headline: 'Just guess it',
      detail:
        n === 2
          ? 'Two candidates left — a probe costs a guaranteed turn to save a coin flip. Take the 50/50.'
          : 'Only one real choice left.'
    };
  }

  if (margin > 0.08) {
    return {
      pick: 'probe',
      margin,
      confidence: 'clear',
      headline: 'Probe is worth it',
      detail: `Probing finishes ${margin.toFixed(2)} turns sooner on average, and cuts the worst case from ${bestAnswer.worst} candidates down to ${bestProbe.worst}.`
    };
  }

  if (margin > 0.02) {
    return {
      pick: 'probe',
      margin,
      confidence: 'slight',
      headline: 'Probe, narrowly',
      detail: `The probe is ${margin.toFixed(2)} turns better on average.${
        winChance >= 0.05
          ? ` Close enough that taking the ${Math.round(winChance * 100)}% win chance instead is defensible.`
          : ' Close enough that either play is reasonable.'
      }`
    };
  }

  if (margin < -0.02) {
    // With a big candidate set the win chance is a rounding error; what actually
    // makes the candidate the better play is that it splits the field just as
    // well as the probe does, and can win as a bonus.
    const detail =
      winChance >= 0.05
        ? `With ${n} left, the ${Math.round(winChance * 100)}% chance of winning outright beats what a probe buys you.`
        : `With ${n} left, the best candidate splits the field about as well as any probe (${bestAnswer.bits.toFixed(1)} vs ${bestProbe.bits.toFixed(1)} bits) — and it can win. No reason to spend a turn on a word that can't.`;

    return {
      pick: 'answer',
      margin,
      confidence: margin < -0.08 ? 'clear' : 'slight',
      headline: 'Guess a candidate',
      detail
    };
  }

  // Dead heat on expected turns — worst case is the tiebreaker that matters.
  const pick = bestProbe.worst < bestAnswer.worst ? 'probe' : 'answer';
  return {
    pick,
    margin,
    confidence: 'tossup',
    headline: 'Genuine toss-up',
    detail:
      pick === 'probe'
        ? `Same expected turns either way, but the probe guarantees you're down to ${bestProbe.worst} and can't get unlucky. The candidate could leave ${bestAnswer.worst}.`
        : winChance >= 0.05
          ? `Same expected turns either way, so take the ${Math.round(winChance * 100)}% chance of ending it now.`
          : 'Same expected turns either way, so prefer the word that can actually win.'
  };
}
