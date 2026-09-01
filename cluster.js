// Groups photos by combined objects+setting similarity. Deliberately brute
// force -- at the project's real scale (tens to a few hundred photos) this
// is milliseconds of work, so there's no need for an Atlas Vector Search
// index here; that's reserved for the signature-matching path where a
// single query vector is compared against many stored ones (see server.js
// /api/webcam-match). Clustering instead needs the *entire* vector set in
// memory at once to compare every photo to every other photo, which an ANN
// index doesn't help with anyway.

const OBJECT_WEIGHT = 0.5;
const CLIP_WEIGHT = 0.5;

// Defaults -- deliberately strict (see chat notes): unrelated photos often
// still land at high raw CLIP cosine similarity, so starting strict and
// loosening after looking at real data is safer than starting loose and
// getting one giant merged cluster.
export const DEFAULT_EPSILON = 0.15;   // combinedSimilarity must be >= 1 - epsilon = 0.85
export const DEFAULT_MIN_POINTS = 2;

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function combinedSimilarity(a, b) {
  const objectScore = a.objectVector && b.objectVector ? dot(a.objectVector, b.objectVector) : 0;
  const clipScore = a.clipEmbedding && b.clipEmbedding ? dot(a.clipEmbedding, b.clipEmbedding) : 0;
  return OBJECT_WEIGHT * objectScore + CLIP_WEIGHT * clipScore;
}

// docs: [{ id, objectVector, clipEmbedding }], vectors assumed pre-normalized
// (runYolo/runClip in inference.js both L2-normalize before returning).
// Returns { assignments: Map<id, groupId|null>, stats }.
export function clusterDocs(docs, { epsilon = DEFAULT_EPSILON, minPoints = DEFAULT_MIN_POINTS } = {}) {
  const n = docs.length;
  const simThreshold = 1 - epsilon;

  // Precompute pairwise similarity once -- O(n^2), trivial at this scale.
  const sim = Array.from({ length: n }, () => new Array(n).fill(0));
  const allScores = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = combinedSimilarity(docs[i], docs[j]);
      sim[i][j] = s;
      sim[j][i] = s;
      allScores.push(s);
    }
  }

  const neighbors = (i) => {
    const result = [];
    for (let j = 0; j < n; j++) if (j !== i && sim[i][j] >= simThreshold) result.push(j);
    return result;
  };

  // Standard DBSCAN
  const UNVISITED = -1, NOISE = -2;
  const labels = new Array(n).fill(UNVISITED);
  let nextGroupId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;
    const neighborIdx = neighbors(i);
    if (neighborIdx.length + 1 < minPoints) {
      labels[i] = NOISE;
      continue;
    }
    const groupId = nextGroupId++;
    labels[i] = groupId;
    const queue = [...neighborIdx];
    while (queue.length) {
      const j = queue.shift();
      if (labels[j] === NOISE) labels[j] = groupId;
      if (labels[j] !== UNVISITED) continue;
      labels[j] = groupId;
      const jNeighbors = neighbors(j);
      if (jNeighbors.length + 1 >= minPoints) queue.push(...jNeighbors);
    }
  }

  const assignments = new Map();
  docs.forEach((doc, i) => {
    assignments.set(doc.id, labels[i] === NOISE ? null : `cluster_${labels[i]}`);
  });

  allScores.sort((a, b) => a - b);
  const stats = {
    photosConsidered: n,
    groupCount: nextGroupId,
    noiseCount: labels.filter(l => l === NOISE).length,
    pairwiseSimilarity: allScores.length
      ? {
          min: allScores[0],
          median: allScores[Math.floor(allScores.length / 2)],
          max: allScores[allScores.length - 1],
        }
      : null,
    epsilon,
    minPoints,
  };

  return { assignments, stats };
}
