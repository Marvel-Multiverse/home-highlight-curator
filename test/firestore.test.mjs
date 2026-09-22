import test from "node:test";
import assert from "node:assert/strict";
import { mergeForUpsert, serviceAccountFromEnvironment } from "../src/firestore.mjs";
import { createHighlightDocument } from "../src/schema.mjs";

const highlight = createHighlightDocument({
  id: 1443,
  name: "Spider-Man",
  imageUrl: "https://comicvine.gamespot.com/image.jpg",
  sourceUrl: "https://comicvine.gamespot.com/api/character/4005-1443/",
  verifiedByComicVine: true
}, {
  eyebrow: "PERSONAGEM EM DESTAQUE",
  title: "Spider-Man",
  description: "Conheça este personagem por meio de informações verificadas em seu arquivo oficial da Comic Vine.",
  actionLabel: "Ver personagem"
}, { model: "test", generatedAt: "2026-08-31T12:00:00.000Z" });

test("documento novo nasce inativo e com ordem zero", () => {
  const merged = mergeForUpsert(highlight, null);
  assert.equal(merged.active, false);
  assert.equal(merged.order, 0);
});

test("update preserva active, lastActivatedDate e order controlados pelo Rotator", () => {
  const existing = { active: true, order: 4, lastActivatedDate: "2026-08-30", title: "Texto antigo" };
  const update = mergeForUpsert(highlight, existing);
  assert.equal(Object.hasOwn(update, "active"), false);
  assert.equal(Object.hasOwn(update, "lastActivatedDate"), false);
  assert.equal(update.order, 4);
  assert.equal(update.title, "Spider-Man");
  assert.equal(existing.active, true);
  assert.equal(existing.lastActivatedDate, "2026-08-30");
});

test("aceita Service Account em memória e mantém alias legado", () => {
  const json = JSON.stringify({ type: "service_account", project_id: "test-project" });
  assert.equal(serviceAccountFromEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: json }).project_id, "test-project");
  assert.equal(serviceAccountFromEnvironment({ FIREBASE_SERVICE_ACCOUNT: json }).project_id, "test-project");
  assert.equal(serviceAccountFromEnvironment({}), null);
  assert.throws(
    () => serviceAccountFromEnvironment({ FIREBASE_SERVICE_ACCOUNT_JSON: "{}" }),
    /não contém um JSON de conta de serviço válido/
  );
});
