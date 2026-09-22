import Ajv from "ajv";
import addFormats from "ajv-formats";

export const SEGMENTS = Object.freeze([
  "NEW_PLAYER",
  "EXPLORER",
  "COLLECTOR",
  "STRATEGIST",
  "SCHOLAR"
]);

export const copySchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    eyebrow: { type: "string", minLength: 3, maxLength: 40 },
    title: { type: "string", minLength: 1, maxLength: 100 },
    description: { type: "string", minLength: 80, maxLength: 180 },
    actionLabel: { type: "string", minLength: 2, maxLength: 32 }
  },
  required: ["eyebrow", "title", "description", "actionLabel"]
});

export const highlightSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", pattern: "^character-[1-9][0-9]*$" },
    active: { const: false },
    order: { type: "integer", minimum: 0 },
    eyebrow: copySchema.properties.eyebrow,
    title: copySchema.properties.title,
    description: copySchema.properties.description,
    imageUrl: { type: "string", pattern: "^https://" },
    actionLabel: copySchema.properties.actionLabel,
    destination: { const: "CHARACTER" },
    entityId: { type: "integer", minimum: 1 },
    segments: {
      type: "array",
      uniqueItems: true,
      items: { enum: SEGMENTS }
    },
    source: { const: "COMIC_VINE" },
    sourceName: { type: "string", minLength: 1 },
    sourceUrl: { type: "string", format: "uri", pattern: "^https?://" },
    generatedBy: { const: "GROQ" },
    generatedWithModel: { type: "string", minLength: 1 },
    generatedAt: { type: "string", format: "date-time" },
    rotationEligible: { type: "boolean" }
  },
  required: [
    "id", "active", "order", "eyebrow", "title", "description", "imageUrl",
    "actionLabel", "destination", "entityId", "segments", "source", "sourceName",
    "sourceUrl", "generatedBy", "generatedWithModel", "generatedAt", "rotationEligible"
  ]
});

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateCopy = ajv.compile(copySchema);
const validateHighlight = ajv.compile(highlightSchema);

function assertSchema(validator, value, label) {
  if (validator(value)) return value;
  const details = validator.errors
    ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  throw new Error(`${label} inválido: ${details || "estrutura desconhecida"}`);
}

function assertNonBlankStrings(value, fields, label) {
  for (const field of fields) {
    if (typeof value?.[field] !== "string" || !value[field].trim()) {
      throw new Error(`${label} inválido: ${field} deve ser uma string não vazia.`);
    }
  }
  return value;
}

function assertWebUrl(rawUrl, label, { httpsOnly = false } = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Comic Vine retornou URL de ${label} inválida.`);
  }
  const allowed = httpsOnly ? parsed.protocol === "https:" : ["http:", "https:"].includes(parsed.protocol);
  if (!allowed) throw new Error(`Comic Vine retornou URL de ${label} com protocolo inválido.`);
}

export function assertGeneratedCopy(value) {
  assertSchema(validateCopy, value, "Texto retornado pela IA");
  return assertNonBlankStrings(value, ["eyebrow", "title", "description", "actionLabel"], "Texto retornado pela IA");
}

export function assertHighlight(value) {
  assertSchema(validateHighlight, value, "Destaque");
  assertNonBlankStrings(value, ["eyebrow", "title", "description", "actionLabel"], "Destaque");
  if (value.id !== `character-${value.entityId}`) {
    throw new Error("Destaque inválido: o ID do documento não corresponde ao entityId.");
  }
  return value;
}

export function createHighlightDocument(character, copy, { model, generatedAt }) {
  assertGeneratedCopy(copy);
  if (!Number.isInteger(character.id) || character.id <= 0 || character.verifiedByComicVine !== true) {
    throw new Error("Comic Vine não confirmou um entityId válido no endpoint de detalhe.");
  }
  if (!character.name?.trim() || copy.title.trim() !== character.name.trim()) {
    throw new Error("A IA alterou o nome oficial retornado pela Comic Vine.");
  }
  assertWebUrl(character.imageUrl, "imagem", { httpsOnly: true });
  assertWebUrl(character.sourceUrl, "detalhe");

  return assertHighlight({
    id: `character-${character.id}`,
    active: false,
    order: 0,
    eyebrow: copy.eyebrow.trim(),
    title: character.name.trim(),
    description: copy.description.trim(),
    imageUrl: character.imageUrl,
    actionLabel: copy.actionLabel.trim(),
    destination: "CHARACTER",
    entityId: character.id,
    segments: [],
    source: "COMIC_VINE",
    sourceName: character.name.trim(),
    sourceUrl: character.sourceUrl,
    generatedBy: "GROQ",
    generatedWithModel: model,
    generatedAt,
    rotationEligible: true
  });
}
