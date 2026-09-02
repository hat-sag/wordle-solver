# Wordle Solver

A strategic Wordle helper that filters possible words based on your guesses, recommends what to
play next, and shows letter probabilities by position.

## Features

- **Freeform word input**: Enter any guess word
- **Color marking**: Click tiles to cycle through gray → yellow → green
- **Real-time filtering**: See possible words narrow down with each guess
- **Two recommendations, side by side**: the best *answer* guess and the best *probe* guess, with
  a verdict on which one to actually play
- **Click any word to use it**: recommendations, runners-up, and the possible-words list all load
  straight into the input
- **Position frequencies**: View letter probability distributions for each position
- **AI lookup**: when the answer isn't in our word bank at all, ask Claude what we're missing

## Answer guesses vs probe guesses

Two different questions, so two different recommendations:

- **Best answer guess** — a word still in the candidate list. It can win outright this turn.
- **Best probe guess** — a word that *cannot* be the answer, chosen to split the remaining
  candidates as evenly as possible. It spends a turn to buy information.

Probing matters most in the classic traps, where every candidate differs by one letter:

```
_ATCH  →  BATCH CATCH HATCH LATCH MATCH PATCH WATCH
```

Guessing candidates one at a time tests one letter per turn and can run you out of guesses. The
probe CLAMP tests four of the varying letters at once — 2.25 bits versus 0.65 for a candidate —
and cuts the worst case from 5 remaining to 2.

### Which one should you play?

The app decides for you rather than leaving it as a judgment call. Each guess is scored on:

- **bits gained** — Shannon entropy over the resulting color-pattern buckets. `log2(n)` bits means
  the guess distinguishes every candidate from every other one.
- **expected turns** — expected total turns to finish, counting this one. An answer guess gets a
  free `1/n` shot at winning immediately, which a probe never has, so the probe has to earn that
  back on information alone.
- **worst case** — the largest number of candidates that could still be left.

The `expectedTurnsFrom(k)` table in `lib/solver.js` (expected guesses to finish once `k` candidates
remain) is measured, not guessed — simulated over the real answer list by playing greedily from
random and letter-clustered candidate sets of each size, with a log fit past `k = 10`.

### Does it help?

Simulated over 250 random answers opening with CRANE:

| Strategy | Avg turns | Worst game |
| --- | --- | --- |
| Always guess a candidate | 3.46 | 8 (a loss) |
| Follow the verdict | 3.40 | 5 |

The average barely moves. The point is the tail: probing when the math says to trades a few lucky
two-turn wins for never getting stuck in a trap.

## AI word lookup

Our bank is the original Wordle answer list plus known NYT additions, so a brand-new NYT word can
leave zero candidates. When that happens a **Ask AI for the missing word** button appears, which
sends just your guesses and their colors to Claude and asks which five-letter words fit.

It needs an API key:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

Then restart the dev server. Without a key the button explains what's missing and nothing else
breaks.

## Running it

```bash
npm install && npm run dev
```

## Layout

- `lib/solver.js` — all the solving math: pattern matching, filtering, scoring, recommendations
- `pages/index.js` — UI
- `pages/api/suggest-words.js` — the Claude lookup for missing words
- `data/words.js` — the word bank
