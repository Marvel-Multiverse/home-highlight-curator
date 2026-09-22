import { createHighlightDocument } from "./schema.mjs";

export async function generateHighlights({ count, offset, seed, model, generatedAt, comicVine, copywriter, logger = console }) {
  const discovery = await comicVine.findValidatedCharacters(count, { offset, seed, logger });
  const highlights = [];
  const ids = new Set();

  for (const [index, character] of discovery.characters.entries()) {
    if (ids.has(character.id)) throw new Error(`A Comic Vine repetiu o personagem ${character.id} na mesma execução.`);
    ids.add(character.id);
    logger.log(`[${index + 1}/${count}] Gerando destaque para ${character.name} (${character.id})...`);
    const copy = await copywriter.write(character);
    highlights.push(createHighlightDocument(character, copy, { model, generatedAt }));
  }

  return { highlights, rejected: discovery.rejected, startStrategy: discovery.startStrategy };
}
