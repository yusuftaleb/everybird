import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** How many species the landing sample (public/data/sample.v1.json, the made-up demo birder) shows. */
export const SAMPLE_COUNT = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/sample.v1.json"), "utf8")) as { birds: unknown[] }).birds.length;

const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: { code: string; ord: string }[] }).species;
const ordOf = new Map(species.map((r) => [r.code, r.ord]));
/** How many orders the landing sample spans (its order chips). */
export const SAMPLE_ORDERS = new Set((JSON.parse(readFileSync(resolve(__dirname, "../public/data/sample.v1.json"), "utf8")) as { birds: { code: string }[] }).birds.map((b) => ordOf.get(b.code))).size;
