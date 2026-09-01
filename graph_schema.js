import mongoose from "mongoose";

// One document per space-press capture. Edges are stored as {source, target}
// pairs of imageId -- this shape matches Cytoscape.js's own edge data format
// directly, so the slideshow page (Step 4) can hand this straight to
// Cytoscape without reshaping it.
const graph_schema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  nodes: [{ type: String, required: true }], // array of imageId
  edges: [
    {
      source: { type: String, required: true }, // imageId
      target: { type: String, required: true }, // imageId
      _id: false,
    },
  ],
});

export const GraphModel = mongoose.model("Graph", graph_schema, "Graphs");