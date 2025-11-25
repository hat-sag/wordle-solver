# Wordle Solver

A strategic Wordle helper that filters possible words based on your guesses and shows letter probabilities by position.

## Features

- **Freeform word input**: Enter any guess word
- **Color marking**: Click tiles to cycle through gray → yellow → green
- **Real-time filtering**: See possible words narrow down with each guess
- **Position frequencies**: View letter probability distributions for each position to make strategic picks

## Setup

### 1. Create a new GitHub repository

Go to GitHub and create a new repository (e.g., `wordle-solver`)

### 2. Push this code to GitHub

```bash
cd wordle-solver
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wordle-solver.git
git push -u origin main
```

### 3. Deploy on Vercel

Since you have GitHub connected to Vercel:

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your `wordle-solver` repository
4. Vercel will auto-detect it's a Next.js project
5. Click "Deploy"

That's it! Your app will be live at `your-project-name.vercel.app`

## How to Use

1. Play Wordle normally and make your first guess
2. Enter that word in the solver
3. Click each tile to match the colors Wordle showed you
4. Click "Add Guess"
5. Look at the possible words and letter frequencies
6. Use the frequencies to strategically pick your next word
7. Repeat until solved!

## Tech Stack

- Next.js 14
- React 18
- Vanilla CSS (styled-jsx)
