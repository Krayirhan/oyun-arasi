// 2048 kuralları: kaydırma/birleştirme, hamle var mı, tahta doğrulama. DOM'a dokunmaz; script.js kullanır.

export const SIZE = 4;

export function isBoard(value) {
  return Array.isArray(value) && value.length === SIZE
    && value.every(row => Array.isArray(row) && row.length === SIZE
      && row.every(cell => Number.isInteger(cell) && (cell === 0 || (cell >= 2 && (cell & (cell - 1)) === 0))));
}

export function equalBoards(left, right) {
  return left.every((row, rowIndex) => row.every((cell, colIndex) => cell === right[rowIndex][colIndex]));
}

// Bir satırı sola kaydırır: sıfırlar atılır, yan yana eşit ikililer soldan başlayarak birleşir ve
// her taş bir hamlede en çok bir kez birleşir (2,2,2,2 → 4,4; 2,2,2 → 4,2).
export function slideLine(line) {
  const values = line.filter(Boolean);
  const result = [];
  const mergedIndexes = [];
  let gained = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      const merged = values[index] * 2;
      mergedIndexes.push(result.length);
      result.push(merged);
      gained += merged;
      index += 1;
    } else {
      result.push(values[index]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { line: result, gained, mergedIndexes };
}

// Tahtayı verilen yöne kaydırır; tahtanın kendisini değiştirmez.
export function shiftBoard(board, direction) {
  const next = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const mergedLocations = [];
  let gained = 0;
  for (let index = 0; index < SIZE; index += 1) {
    const line = direction === 'left' || direction === 'right' ? [...board[index]] : board.map(row => row[index]);
    if (direction === 'right' || direction === 'down') line.reverse();
    const slid = slideLine(line);
    if (direction === 'right' || direction === 'down') slid.line.reverse();
    gained += slid.gained;
    for (const mergedIndex of slid.mergedIndexes) {
      const offset = direction === 'right' || direction === 'down' ? SIZE - 1 - mergedIndex : mergedIndex;
      mergedLocations.push(direction === 'left' || direction === 'right' ? `${index}-${offset}` : `${offset}-${index}`);
    }
    for (let offset = 0; offset < SIZE; offset += 1) {
      if (direction === 'left' || direction === 'right') next[index][offset] = slid.line[offset];
      else next[offset][index] = slid.line[offset];
    }
  }
  return { board: next, gained, mergedLocations };
}

export function canMove(board) {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === 0) return true;
      if (col + 1 < SIZE && board[row][col] === board[row][col + 1]) return true;
      if (row + 1 < SIZE && board[row][col] === board[row + 1][col]) return true;
    }
  }
  return false;
}
