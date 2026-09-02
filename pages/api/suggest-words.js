import Anthropic from '@anthropic-ai/sdk';

// Fallback for the days when the answer isn't in our word bank at all.
//
// Our list is the original Wordle answer set plus a handful of known NYT
// additions, so a brand-new NYT word leaves the solver with zero candidates.
// Rather than growing the bank by hand, we hand the constraints to Claude and
// ask what five-letter words fit.

const SUGGEST_TOOL = {
  name: 'propose_words',
  description: 'Return five-letter English words that satisfy every Wordle constraint given.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      words: {
        type: 'array',
        description:
          'Candidate answers, most likely first. Empty if no real word fits the constraints.',
        items: {
          type: 'object',
          properties: {
            word: {
              type: 'string',
              description: 'A lowercase five-letter English word.'
            },
            reason: {
              type: 'string',
              description:
                'One short clause on why it fits and how common it is. No more than 12 words.'
            }
          },
          required: ['word', 'reason'],
          additionalProperties: false
        }
      }
    },
    required: ['words'],
    additionalProperties: false
  }
};

// Turn the board state into the constraints in plain language, so the model
// never has to reverse-engineer our color encoding.
export function describeConstraints(guesses) {
  const lines = [];

  for (const { word, colors } of guesses) {
    const parts = colors.map((color, i) => {
      const letter = word[i].toUpperCase();
      const position = i + 1;
      if (color === 'green') return `${letter} is in position ${position}`;
      if (color === 'yellow') return `${letter} is in the word but NOT in position ${position}`;
      return `${letter} is not in the word (or has no more occurrences than already marked)`;
    });
    lines.push(`Guessed ${word.toUpperCase()} -> ${parts.join('; ')}`);
  }

  return lines.join('\n');
}

export function isValidGuessList(guesses) {
  return (
    Array.isArray(guesses) &&
    guesses.length > 0 &&
    guesses.length <= 6 &&
    guesses.every(
      g =>
        g &&
        typeof g.word === 'string' &&
        /^[a-z]{5}$/.test(g.word) &&
        Array.isArray(g.colors) &&
        g.colors.length === 5 &&
        g.colors.every(c => c === 'green' || c === 'yellow' || c === 'gray')
    )
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error:
        'No ANTHROPIC_API_KEY configured. Add it to .env.local and restart the dev server to enable AI lookup.'
    });
  }

  const { guesses } = req.body || {};

  if (!isValidGuessList(guesses)) {
    return res.status(400).json({ error: 'Invalid guesses payload' });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system:
        'You are a Wordle expert. Given the feedback from a set of guesses, list five-letter ' +
        'English words that satisfy every constraint. Prefer words plausible as a New York Times ' +
        'Wordle answer: common, non-hyphenated, not a proper noun, not a plural formed by adding ' +
        'S to a four-letter word. Recent NYT answers include words absent from the original 2021 ' +
        'answer list, so consider newer and less common vocabulary too. Check each word against ' +
        'every constraint before returning it. Return at most 8 words, and return an empty list ' +
        'if nothing genuinely fits.',
      messages: [
        {
          role: 'user',
          content:
            `Here is the board so far:\n\n${describeConstraints(guesses)}\n\n` +
            'Our word bank has no matches, so the answer is probably a word we are missing. ' +
            'Use the propose_words tool to return the five-letter words that fit these clues.'
        }
      ],
      tools: [SUGGEST_TOOL],
      tool_choice: { type: 'tool', name: 'propose_words' }
    });

    const toolUse = response.content.find(block => block.type === 'tool_use');

    if (!toolUse) {
      return res.status(502).json({ error: 'Claude did not return a word list. Try again.' });
    }

    // Belt and braces: the model can still hallucinate a non-five-letter word,
    // and anything we show has to be usable in the input box.
    const words = (toolUse.input.words || [])
      .filter(item => typeof item?.word === 'string' && /^[a-zA-Z]{5}$/.test(item.word))
      .map(item => ({
        word: item.word.toLowerCase(),
        reason: typeof item.reason === 'string' ? item.reason : ''
      }))
      .slice(0, 8);

    return res.status(200).json({ words });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(401).json({ error: 'ANTHROPIC_API_KEY was rejected.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Rate limited by the API — try again in a moment.' });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `Claude API error (${err.status}).` });
    }
    console.error('suggest-words failed', err);
    return res.status(500).json({ error: 'Unexpected error looking up words.' });
  }
}
