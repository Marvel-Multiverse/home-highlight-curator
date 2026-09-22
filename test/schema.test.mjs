import test from "node:test";
import assert from "node:assert/strict";
import { assertGeneratedCopy, assertHighlight, createHighlightDocument } from "../src/schema.mjs";

const character = {
  id: 1443,
  name: "Spider-Man",
  imageUrl: "https://comicvine.gamespot.com/example/spider-man.jpg",
  sourceUrl: "https://comicvine.gamespot.com/api/character/4005-1443/",
  verifiedByComicVine: true
};
const copy = {
  eyebrow: "PERSONAGEM EM DESTAQUE",
  title: "Spider-Man",
  description: "Conheça um dos personagens mais reconhecidos dos quadrinhos a partir dos dados oficiais disponíveis em seu arquivo.",
  actionLabel: "Ver personagem"
};

test("aceita a microcopy completa, não vazia e estrita", () => {
  assert.equal(assertGeneratedCopy(copy), copy);
  assert.throws(() => assertGeneratedCopy({ ...copy, title: "   " }), /não vazia/);
});

test("rejeita title ou description ausentes", () => {
  const { title: _title, ...withoutTitle } = copy;
  const { description: _description, ...withoutDescription } = copy;
  assert.throws(() => assertGeneratedCopy(withoutTitle), /title/);
  assert.throws(() => assertGeneratedCopy(withoutDescription), /description/);
});

test("rejeita alucinações estruturais da IA", () => {
  assert.throws(() => assertGeneratedCopy({ ...copy, entityId: 999999 }), /additional properties/);
  assert.throws(() => assertGeneratedCopy({ ...copy, destination: "SHOP" }), /additional properties/);
});

test("monta ID estável, CHARACTER, ordem zero e estado inicialmente inativo", () => {
  const result = createHighlightDocument(character, copy, {
    model: "test-model",
    generatedAt: "2026-08-31T12:00:00.000Z"
  });
  assert.equal(result.id, "character-1443");
  assert.equal(result.entityId, 1443);
  assert.equal(result.destination, "CHARACTER");
  assert.equal(result.active, false);
  assert.equal(result.order, 0);
  assert.deepEqual(result.segments, []);
});

test("rejeita entityId não confirmado e URL inválida", () => {
  assert.throws(() => createHighlightDocument({ ...character, verifiedByComicVine: false }, copy, {
    model: "test", generatedAt: "2026-08-31T12:00:00.000Z"
  }), /não confirmou/);
  assert.throws(() => createHighlightDocument({ ...character, imageUrl: "javascript:alert(1)" }, copy, {
    model: "test", generatedAt: "2026-08-31T12:00:00.000Z"
  }), /protocolo/);
});

test("rejeita nome alterado pela IA, segmentos inválidos e destino inválido", () => {
  assert.throws(() => createHighlightDocument(character, { ...copy, title: "Homem-Aranha" }, {
    model: "test", generatedAt: "2026-08-31T12:00:00.000Z"
  }), /nome oficial/);
  const valid = createHighlightDocument(character, copy, {
    model: "test", generatedAt: "2026-08-31T12:00:00.000Z"
  });
  assert.throws(() => assertHighlight({ ...valid, segments: ["UNKNOWN"] }), /segments/);
  assert.throws(() => assertHighlight({ ...valid, destination: "SHOP" }), /destination/);
});

test("rejeita timestamp administrativo fora do formato ISO 8601", () => {
  assert.throws(() => createHighlightDocument(character, copy, {
    model: "test", generatedAt: "agora"
  }), /date-time/);
});
