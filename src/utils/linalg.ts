/**
 * Dense linear algebra for small-to-medium symmetric systems.
 *
 * Matrices are square, row-major Float64Arrays. Dense storage keeps the code
 * simple and auditable; it is adequate for trusses up to roughly a thousand
 * degrees of freedom in the browser. A banded or sparse solver can replace it
 * later without changing the callers.
 */

export interface DenseMatrix {
  readonly n: number;
  /** Row-major: entry (i, j) is data[i * n + j]. */
  readonly data: Float64Array;
}

export function zeros(n: number): DenseMatrix {
  return { n, data: new Float64Array(n * n) };
}

export function fromRows(rows: readonly (readonly number[])[]): DenseMatrix {
  const n = rows.length;
  const m = zeros(n);
  rows.forEach((row, i) => {
    if (row.length !== n) throw new Error('fromRows: matrix must be square');
    row.forEach((v, j) => (m.data[i * n + j] = v));
  });
  return m;
}

export function matVec(a: DenseMatrix, x: ArrayLike<number>): Float64Array {
  const { n, data } = a;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = i * n;
    for (let j = 0; j < n; j++) s += data[row + j]! * x[j]!;
    y[i] = s;
  }
  return y;
}

/**
 * A = L D Lᵀ with L unit lower triangular and D diagonal.
 *
 * `zeroPivots` lists the indices where the pivot vanished (to within the
 * tolerance). For a symmetric positive semi-definite matrix their count equals
 * the dimension of the null space; an empty list means A is positive definite.
 */
export interface LDLTFactorization {
  readonly n: number;
  /** Row-major unit lower triangle; columns of zero pivots are zero below the diagonal. */
  readonly L: Float64Array;
  readonly d: Float64Array;
  readonly zeroPivots: readonly number[];
}

/**
 * Default threshold for a vanishing pivot, relative to the original diagonal
 * entry of that row. A positive semi-definite matrix with an exact null space
 * produces pivots of order machine epsilon (≈ 1e-16) times the diagonal; a
 * genuine stiffness contrast would need to exceed ten orders of magnitude to
 * be mistaken for one.
 */
export const DEFAULT_PIVOT_TOLERANCE = 1e-10;

/**
 * Square-root-free Cholesky (LDLᵀ) factorisation of a symmetric matrix,
 * without pivoting.
 *
 * Intended for symmetric positive semi-definite matrices such as stiffness
 * matrices. When a pivot vanishes, the row is recorded in `zeroPivots` and
 * decoupled (its column of L is left at zero) so the factorisation continues
 * and finds every independent singular direction. For a PSD matrix a vanishing
 * pivot implies the rest of its Schur-complement column vanishes too, so this
 * loses no information.
 *
 * Only the lower triangle of `a` is read.
 */
export function ldltFactor(a: DenseMatrix, relTol = DEFAULT_PIVOT_TOLERANCE): LDLTFactorization {
  const { n, data } = a;
  const L = new Float64Array(n * n);
  const d = new Float64Array(n);
  const w = new Float64Array(n); // w[k] = L[j][k] * d[k] for the current column j
  const zeroPivots: number[] = [];

  for (let j = 0; j < n; j++) {
    const rowJ = j * n;
    const diag = data[rowJ + j]!;
    let pivot = diag;
    for (let k = 0; k < j; k++) {
      const ljk = L[rowJ + k]!;
      w[k] = ljk * d[k]!;
      pivot -= ljk * w[k]!;
    }
    L[rowJ + j] = 1;

    // `!(x > y)` also catches NaN.
    if (!(diag > 0) || !(pivot > relTol * diag)) {
      d[j] = 0;
      zeroPivots.push(j);
      continue;
    }

    d[j] = pivot;
    for (let i = j + 1; i < n; i++) {
      const rowI = i * n;
      let s = data[rowI + j]!;
      for (let k = 0; k < j; k++) s -= L[rowI + k]! * w[k]!;
      L[rowI + j] = s / pivot;
    }
  }

  return { n, L, d, zeroPivots };
}

/** Solve A x = b using an LDLᵀ factorisation. Throws if A is singular. */
export function ldltSolve(f: LDLTFactorization, b: ArrayLike<number>): Float64Array {
  if (f.zeroPivots.length > 0) throw new Error('ldltSolve: matrix is singular');
  const { n, L, d } = f;
  const x = new Float64Array(n);

  // Forward substitution: L y = b
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    const row = i * n;
    for (let k = 0; k < i; k++) s -= L[row + k]! * x[k]!;
    x[i] = s;
  }
  // Diagonal: D z = y
  for (let i = 0; i < n; i++) x[i] = x[i]! / d[i]!;
  // Back substitution: Lᵀ x = z
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]!;
    for (let k = i + 1; k < n; k++) s -= L[k * n + i]! * x[k]!;
    x[i] = s;
  }
  return x;
}

/**
 * Null-space vector associated with the zero pivot at index `k`: solves
 * Lᵀ x = e_k, so that A x = L D e_k = 0. Normalised to a maximum absolute
 * component of 1.
 */
export function nullVector(f: LDLTFactorization, k: number): Float64Array {
  const { n, L } = f;
  const x = new Float64Array(n);
  x[k] = 1;
  for (let i = k - 1; i >= 0; i--) {
    let s = 0;
    for (let m = i + 1; m <= k; m++) s -= L[m * n + i]! * x[m]!;
    x[i] = s;
  }
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(x[i]!));
  for (let i = 0; i < n; i++) x[i] = x[i]! / max;
  return x;
}
