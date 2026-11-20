// The tree file (public/data/tree.v1.json), fetched and parsed once per page for the Tree view and its share image.
import { fetchData } from '@/lib/data-url'
import { parseNewick, type Tree, type TreeFile } from './tree'

let treeP: Promise<{ file: TreeFile; tree: Tree }> | null = null
/** The tree, fetched and parsed once per page (a failure is not cached). */
export function loadTree(): Promise<{ file: TreeFile; tree: Tree }> {
  treeP ??= fetchData<TreeFile>('tree.v1.json').then((file) => ({ file, tree: parseNewick(file.newick, file.taxOnly) })).catch((e) => {
    treeP = null
    throw e
  })
  return treeP
}
