import test from "node:test";
import assert from "node:assert/strict";
import { HighlightCopywriter } from "../src/groq-copy.mjs";

const character = { name: "Spider-Man", summary: "Herói dos quadrinhos.", realName: null };
const validCopy = {
  eyebrow: "PERSONAGEM EM DESTAQUE",
  title: "Spider-Man",
  description: "Explore o arquivo deste personagem e conheça os dados factuais disponíveis sobre sua trajetória nos quadrinhos.",
  actionLabel: "Ver personagem"
};

test("exige GROQ_API_KEY quando não há cliente mockado", () => {
  assert.throws(() => new HighlightCopywriter(null, "openai/gpt-oss-20b"), /GROQ_API_KEY/);
});

test("usa Structured Outputs da Groq e aceita resposta mockada válida sem chamada real", async () => {
  let request;
  const client = { chat: { completions: { create: async (value) => {
    request = value;
    return { choices: [{ message: { content: JSON.stringify(validCopy) } }] };
  } } } };
  const writer = new HighlightCopywriter(null, "test-model", { client });
  assert.deepEqual(await writer.write(character), validCopy);
  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(Object.hasOwn(request.response_format.json_schema.schema.properties, "entityId"), false);
  assert.equal(Object.hasOwn(request.response_format.json_schema.schema.properties, "destination"), false);
});

test("rejeita resposta mockada da Groq com entityId inventado", async () => {
  const client = { chat: { completions: { create: async () => ({
    choices: [{ message: { content: JSON.stringify({ ...validCopy, entityId: 999999 }) } }]
  }) } } };
  const writer = new HighlightCopywriter(null, "test-model", { client });
  await assert.rejects(writer.write(character), /additional properties/);
});
