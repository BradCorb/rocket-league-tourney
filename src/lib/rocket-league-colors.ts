type PaletteType = "PRIMARY" | "ACCENT";

const ACCENT_GRID = [
  ["#E5E5E5", "#FF7F7F", "#FF9F7F", "#FFCF7F", "#EFFF7F", "#AFFF7F", "#7FFF7F", "#7FFFB2", "#7FE9FF", "#7FB0FF", "#7F88FF", "#AE7FFF", "#E57FFF", "#FF7FD0", "#FF7F94"],
  ["#BFBFBF", "#FF5959", "#FF8259", "#FFC059", "#EAFF59", "#97FF59", "#59FF59", "#59FF9B", "#59E3FF", "#5998FF", "#5964FF", "#9659FF", "#DD59FF", "#FF59C2", "#FF5974"],
  ["#999999", "#FF3232", "#FF6532", "#FFB232", "#E5FF32", "#7FFF32", "#32FF32", "#32FF84", "#32DCFF", "#3281FF", "#3240FF", "#7D32FF", "#D632FF", "#FF32B4", "#FF3255"],
  ["#666666", "#FF0000", "#FF3F00", "#FF9F00", "#DFFF00", "#5FFF00", "#00FF00", "#00FF66", "#00D4FF", "#0061FF", "#0011FF", "#5D00FF", "#CC00FF", "#FF00A1", "#FF002A"],
  ["#3F3F3F", "#B20000", "#B22C00", "#B26F00", "#9CB200", "#42B200", "#00B200", "#00B247", "#0094B2", "#0044B2", "#000BB2", "#410082", "#8E00B2", "#B20071", "#B2001D"],
  ["#262626", "#660000", "#661900", "#663F00", "#596600", "#266600", "#006600", "#006628", "#005466", "#002766", "#000666", "#250066", "#510066", "#660040", "#660011"],
  ["#000000", "#330000", "#330C00", "#331F00", "#2C3300", "#133300", "#003300", "#003314", "#002A33", "#001333", "#000333", "#120033", "#280033", "#330020", "#330008"],
] as const;

const PRIMARY_GRID = ACCENT_GRID.slice(0, 6);

const NAMED_SWATCHES = [
  ["White", "#FFFFFF"],
  ["Silver", "#C0C0C0"],
  ["Gray", "#808080"],
  ["Black", "#000000"],
  ["Red", "#FF0000"],
  ["Orange", "#FF7F00"],
  ["Gold", "#FFD700"],
  ["Yellow", "#FFFF00"],
  ["Lime", "#BFFF00"],
  ["Green", "#00AA00"],
  ["Mint", "#66FFB3"],
  ["Cyan", "#00D8FF"],
  ["Sky Blue", "#66B2FF"],
  ["Blue", "#0066FF"],
  ["Navy", "#001A66"],
  ["Indigo", "#4B0082"],
  ["Violet", "#8A2BE2"],
  ["Purple", "#CC00FF"],
  ["Magenta", "#FF00AA"],
  ["Pink", "#FF69B4"],
  ["Rose", "#FF3355"],
  ["Maroon", "#660000"],
  ["Brown", "#663300"],
] as const;

function hexToRgb(hex: string) {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function distance(a: string, b: string) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
}

function nearestSwatchName(hex: string) {
  let winner: string = NAMED_SWATCHES[0][0];
  let best = Number.POSITIVE_INFINITY;
  for (const [name, swatchHex] of NAMED_SWATCHES) {
    const d = distance(hex, swatchHex);
    if (d < best) {
      best = d;
      winner = name;
    }
  }
  return winner;
}

function getGrid(type: PaletteType) {
  return type === "PRIMARY" ? PRIMARY_GRID : ACCENT_GRID;
}

function normalizeHex(hex: string) {
  const clean = hex.trim().toUpperCase();
  return clean.startsWith("#") ? clean : `#${clean}`;
}

export function getRocketLeaguePaletteSize(type: PaletteType) {
  const grid = getGrid(type);
  return grid.length * grid[0].length;
}

export function getRocketLeagueColorMeta(hex: string, type: PaletteType) {
  const normalized = normalizeHex(hex);
  const grid = getGrid(type);
  let nearest: { row: number; col: number; hex: string; distance: number } = {
    row: 1,
    col: 1,
    hex: grid[0][0],
    distance: Number.POSITIVE_INFINITY,
  };
  let exactMatch = false;

  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      const swatchHex = grid[r][c];
      const d = distance(normalized, swatchHex);
      if (d < nearest.distance) {
        nearest = { row: r + 1, col: c + 1, hex: swatchHex, distance: d };
      }
      if (swatchHex === normalized) {
        exactMatch = true;
      }
    }
  }

  const nameBase = nearestSwatchName(nearest.hex);
  return {
    type,
    hex: normalized,
    exactMatch,
    row: nearest.row,
    col: nearest.col,
    paletteHex: nearest.hex,
    label: `${nameBase} ${nearest.col}/${nearest.row}`,
  };
}

export function resolveRocketLeagueColorInput(
  input: string | undefined,
  type: PaletteType,
  fallback: string,
) {
  const raw = (input ?? "").trim();
  if (!raw) return normalizeHex(fallback);

  const hexCandidate = normalizeHex(raw);
  if (/^#[0-9A-F]{6}$/.test(hexCandidate)) {
    return hexCandidate;
  }

  const coord = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!coord) return normalizeHex(fallback);

  const col = Number(coord[1]);
  const row = Number(coord[2]);
  const grid = getGrid(type);
  const maxRows = grid.length;
  const maxCols = grid[0]?.length ?? 0;
  if (row < 1 || row > maxRows || col < 1 || col > maxCols) {
    return normalizeHex(fallback);
  }
  return grid[row - 1][col - 1];
}
