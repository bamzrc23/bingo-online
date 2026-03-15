export type PatternCell = {
  row: number
  col: number
}

export type PatternCategory = 'letter' | 'number'

export type DefaultPattern = {
  code: string
  name: string
  category: PatternCategory
  cells: PatternCell[]
}

type MatrixPattern = {
  code: string
  name: string
  category: PatternCategory
  matrix: [string, string, string, string, string]
}

const toCells = (matrix: [string, string, string, string, string]): PatternCell[] => {
  const cells: PatternCell[] = []

  for (let row = 0; row < matrix.length; row++) {
    const line = matrix[row]
    for (let col = 0; col < line.length; col++) {
      if (line[col] === 'X') {
        cells.push({ row: row + 1, col: col + 1 })
      }
    }
  }

  return cells
}

const matrixPatterns: MatrixPattern[] = [
  {
    code: 'L-A',
    name: 'Letra A',
    category: 'letter',
    matrix: ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
  },
  {
    code: 'L-B',
    name: 'Letra B',
    category: 'letter',
    matrix: ['XXXX.', 'X...X', 'XXXX.', 'X...X', 'XXXX.'],
  },
  {
    code: 'L-C',
    name: 'Letra C',
    category: 'letter',
    matrix: ['.XXXX', 'X....', 'X....', 'X....', '.XXXX'],
  },
  {
    code: 'L-D',
    name: 'Letra D',
    category: 'letter',
    matrix: ['XXXX.', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  },
  {
    code: 'L-E',
    name: 'Letra E',
    category: 'letter',
    matrix: ['XXXXX', 'X....', 'XXXX.', 'X....', 'XXXXX'],
  },
  {
    code: 'L-F',
    name: 'Letra F',
    category: 'letter',
    matrix: ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....'],
  },
  {
    code: 'L-G',
    name: 'Letra G',
    category: 'letter',
    matrix: ['.XXXX', 'X....', 'X.XXX', 'X...X', '.XXXX'],
  },
  {
    code: 'L-H',
    name: 'Letra H',
    category: 'letter',
    matrix: ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X'],
  },
  {
    code: 'L-I',
    name: 'Letra I',
    category: 'letter',
    matrix: ['XXXXX', '..X..', '..X..', '..X..', 'XXXXX'],
  },
  {
    code: 'L-J',
    name: 'Letra J',
    category: 'letter',
    matrix: ['XXXXX', '...X.', '...X.', 'X..X.', '.XX..'],
  },
  {
    code: 'L-K',
    name: 'Letra K',
    category: 'letter',
    matrix: ['X...X', 'X..X.', 'XXX..', 'X..X.', 'X...X'],
  },
  {
    code: 'L-L',
    name: 'Letra L',
    category: 'letter',
    matrix: ['X....', 'X....', 'X....', 'X....', 'XXXXX'],
  },
  {
    code: 'L-M',
    name: 'Letra M',
    category: 'letter',
    matrix: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  },
  {
    code: 'L-N',
    name: 'Letra N',
    category: 'letter',
    matrix: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X'],
  },
  {
    code: 'L-O',
    name: 'Letra O',
    category: 'letter',
    matrix: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
  },
  {
    code: 'L-P',
    name: 'Letra P',
    category: 'letter',
    matrix: ['XXXX.', 'X...X', 'XXXX.', 'X....', 'X....'],
  },
  {
    code: 'L-Q',
    name: 'Letra Q',
    category: 'letter',
    matrix: ['.XXX.', 'X...X', 'X...X', 'X..XX', '.XXXX'],
  },
  {
    code: 'L-R',
    name: 'Letra R',
    category: 'letter',
    matrix: ['XXXX.', 'X...X', 'XXXX.', 'X..X.', 'X...X'],
  },
  {
    code: 'L-S',
    name: 'Letra S',
    category: 'letter',
    matrix: ['.XXXX', 'X....', '.XXX.', '....X', 'XXXX.'],
  },
  {
    code: 'L-T',
    name: 'Letra T',
    category: 'letter',
    matrix: ['XXXXX', '..X..', '..X..', '..X..', '..X..'],
  },
  {
    code: 'N-1',
    name: 'Numero 1',
    category: 'number',
    matrix: ['..X..', '.XX..', '..X..', '..X..', '.XXX.'],
  },
  {
    code: 'N-2',
    name: 'Numero 2',
    category: 'number',
    matrix: ['.XXX.', '....X', '.XXX.', 'X....', 'XXXXX'],
  },
  {
    code: 'N-3',
    name: 'Numero 3',
    category: 'number',
    matrix: ['.XXX.', '....X', '.XXX.', '....X', '.XXX.'],
  },
  {
    code: 'N-4',
    name: 'Numero 4',
    category: 'number',
    matrix: ['X...X', 'X...X', 'XXXXX', '....X', '....X'],
  },
  {
    code: 'N-5',
    name: 'Numero 5',
    category: 'number',
    matrix: ['XXXXX', 'X....', 'XXXX.', '....X', 'XXXX.'],
  },
  {
    code: 'N-6',
    name: 'Numero 6',
    category: 'number',
    matrix: ['.XXX.', 'X....', 'XXXX.', 'X...X', '.XXX.'],
  },
  {
    code: 'N-7',
    name: 'Numero 7',
    category: 'number',
    matrix: ['XXXXX', '...X.', '..X..', '.X...', 'X....'],
  },
  {
    code: 'N-8',
    name: 'Numero 8',
    category: 'number',
    matrix: ['.XXX.', 'X...X', '.XXX.', 'X...X', '.XXX.'],
  },
  {
    code: 'N-9',
    name: 'Numero 9',
    category: 'number',
    matrix: ['.XXX.', 'X...X', '.XXXX', '....X', '.XXX.'],
  },
]

export const defaultPatterns: DefaultPattern[] = matrixPatterns.map((pattern) => ({
  code: pattern.code,
  name: pattern.name,
  category: pattern.category,
  cells: toCells(pattern.matrix),
}))
