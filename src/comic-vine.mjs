import { createHash } from "node:crypto";

const API_BASE_URL = "https://comicvine.gamespot.com/api/";
const CHARACTER_FIELDS = [
  "id", "name", "real_name", "deck", "aliases", "image", "publisher", "origin",
  "count_of_issue_appearances", "api_detail_url", "site_detail_url"
].join(",");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function bestImage(image = {}) {
  return image.original_url || image.screen_large_url || image.screen_url || image.medium_url || null;
}

function cleanText(value) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2_000) || null
    : null;
}

function isWebUrl(value, { httpsOnly = false } = {}) {
  try {
    const protocol = new URL(value).protocol;
    return httpsOnly ? protocol === "https:" : protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeCharacter(raw, verifiedByComicVine = false) {
  return {
    id: raw?.id,
    name: raw?.name?.trim(),
    realName: raw?.real_name?.trim() || null,
    summary: cleanText(raw?.deck),
    aliases: cleanText(raw?.aliases),
    publisher: raw?.publisher?.name?.trim() || null,
    origin: raw?.origin?.name?.trim() || null,
    issueAppearances: raw?.count_of_issue_appearances ?? raw?.count_of_isssue_appearances ?? null,
    imageUrl: bestImage(raw?.image),
    sourceUrl: raw?.api_detail_url || null,
    siteUrl: raw?.site_detail_url || null,
    verifiedByComicVine
  };
}

function isUsable(character) {
  return Number.isInteger(character.id) && character.id > 0 && Boolean(character.name)
    && isWebUrl(character.imageUrl, { httpsOnly: true }) && isWebUrl(character.sourceUrl);
}

function isMarvelCharacter(character) {
  return typeof character.publisher === "string" && /\bmarvel\b/i.test(character.publisher);
}

function retryableStatus(status) {
  return status === 429 || status >= 500;
}

function seededOffset(totalResults, count, seed) {
  const available = Math.max(1, totalResults - Math.max(count, 1) + 1);
  const numeric = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 12), 16);
  return numeric % available;
}

export class ComicVineClient {
  constructor(apiKey, { fetchImpl = fetch, sleepImpl = wait, attempts = 3 } = {}) {
    if (!apiKey) throw new Error("COMIC_VINE_API_KEY não configurada. Configure no .env antes de executar.");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
    this.attempts = attempts;
  }

  async request(path, params = {}) {
    let lastError;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const url = new URL(path, API_BASE_URL);
        url.search = new URLSearchParams({
          api_key: this.apiKey,
          format: "json",
          ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))
        });
        const response = await this.fetchImpl(url, {
          headers: { "User-Agent": "MarvelMultiverseHomeCurator/1.0" },
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) {
          const error = new Error(`Comic Vine respondeu HTTP ${response.status}.`);
          error.retryable = retryableStatus(response.status);
          throw error;
        }
        const body = await response.json();
        if (body.status_code !== 1) {
          const error = new Error(`Comic Vine recusou a consulta: ${body.error || "erro desconhecido"}`);
          error.retryable = body.status_code === 107;
          throw error;
        }
        return body;
      } catch (error) {
        lastError = error;
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        if (attempt === this.attempts || (!error?.retryable && !timedOut)) throw error;
        await this.sleepImpl(500 * (2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }

  async catalogSize() {
    const body = await this.request("characters/", { field_list: "id", limit: 1, offset: 0 });
    const total = Number(body.number_of_total_results);
    if (!Number.isInteger(total) || total < 1) throw new Error("Comic Vine não informou o tamanho do catálogo de personagens.");
    return total;
  }

  async listCharacters({ limit, offset }) {
    const body = await this.request("characters/", {
      field_list: CHARACTER_FIELDS,
      limit,
      offset
    });
    return Array.isArray(body.results)
      ? body.results.map((raw) => normalizeCharacter(raw)).filter((character) => isUsable(character) && isMarvelCharacter(character))
      : [];
  }

  async getCharacter(id) {
    const body = await this.request(`character/4005-${id}/`, { field_list: CHARACTER_FIELDS });
    const character = normalizeCharacter(body.results, true);
    if (!isUsable(character) || !isMarvelCharacter(character) || character.id !== id) {
      throw new Error(`O entityId ${id} não foi validado pela Comic Vine.`);
    }
    return character;
  }

  async findValidatedCharacters(count, { offset = null, seed = new Date().toISOString().slice(0, 10), logger = console } = {}) {
    const totalResults = await this.catalogSize();
    let nextOffset = offset ?? seededOffset(totalResults, count, seed);
    if (nextOffset >= totalResults) throw new Error(`--offset deve ser menor que o catálogo atual (${totalResults}).`);

    const selected = [];
    const seen = new Set();
    let wrapped = false;
    let rejected = 0;

    for (let page = 0; page < 12 && selected.length < count; page += 1) {
      const pageSize = Math.min(100, Math.max(20, (count - selected.length) * 2));
      const candidates = await this.listCharacters({ limit: pageSize, offset: nextOffset });
      nextOffset += pageSize;
      if (nextOffset >= totalResults && !wrapped) {
        nextOffset = 0;
        wrapped = true;
      }
      if (candidates.length === 0 && wrapped) break;

      for (const candidate of candidates) {
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        try {
          selected.push(await this.getCharacter(candidate.id));
        } catch (error) {
          rejected += 1;
          logger.warn(`Ignorando character-${candidate.id}: ${error.message}`);
        }
        if (selected.length === count) break;
      }
    }

    if (selected.length !== count) {
      throw new Error(`A Comic Vine forneceu apenas ${selected.length} de ${count} personagens válidos.`);
    }
    return { characters: selected, rejected, startStrategy: offset === null ? `seed:${seed}` : `offset:${offset}` };
  }
}
