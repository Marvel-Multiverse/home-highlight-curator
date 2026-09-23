import test from "node:test";
import assert from "node:assert/strict";
import { ComicVineClient } from "../src/comic-vine.mjs";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const rawCharacter = {
  id: 1443,
  name: "Spider-Man",
  deck: "Herói dos quadrinhos.",
  publisher: { name: "Marvel" },
  image: { original_url: "https://comicvine.gamespot.com/spider-man.jpg" },
  api_detail_url: "https://comicvine.gamespot.com/api/character/4005-1443/"
};

test("confirma o mesmo ID no endpoint real de detalhe", async () => {
  const client = new ComicVineClient("test-key", {
    fetchImpl: async () => response({ status_code: 1, results: rawCharacter }),
    sleepImpl: async () => {}
  });
  const character = await client.getCharacter(1443);
  assert.equal(character.id, 1443);
  assert.equal(character.verifiedByComicVine, true);
});

test("rejeita detalhe com ID diferente e imagem insegura", async () => {
  const wrongId = new ComicVineClient("test-key", {
    fetchImpl: async () => response({ status_code: 1, results: { ...rawCharacter, id: 1807 } })
  });
  await assert.rejects(wrongId.getCharacter(1443), /não foi validado/);
  const insecure = new ComicVineClient("test-key", {
    fetchImpl: async () => response({ status_code: 1, results: { ...rawCharacter, image: { original_url: "http://example.com/image.jpg" } } })
  });
  await assert.rejects(insecure.getCharacter(1443), /não foi validado/);
});

test("aceita somente personagens publicados pela Marvel", async () => {
  const dcCharacter = {
    ...rawCharacter,
    id: 1699,
    name: "Batman",
    publisher: { name: "DC Comics" },
    api_detail_url: "https://comicvine.gamespot.com/api/character/4005-1699/"
  };
  const client = new ComicVineClient("test-key", {
    fetchImpl: async (url) => url.pathname.includes("characters/")
      ? response({ status_code: 1, results: [dcCharacter, rawCharacter] })
      : response({ status_code: 1, results: dcCharacter })
  });

  const listed = await client.listCharacters({ limit: 2, offset: 0 });
  assert.deepEqual(listed.map((character) => character.name), ["Spider-Man"]);
  await assert.rejects(client.getCharacter(1699), /não foi validado/);
});

test("faz retry limitado para 429", async () => {
  let calls = 0;
  const client = new ComicVineClient("test-key", {
    attempts: 3,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? response({}, 429) : response({ status_code: 1, number_of_total_results: 10, results: [] });
    }
  });
  assert.equal(await client.catalogSize(), 10);
  assert.equal(calls, 3);
});
