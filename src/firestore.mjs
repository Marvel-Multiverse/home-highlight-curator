import { access } from "node:fs/promises";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertHighlight } from "./schema.mjs";

const COLLECTION = "home_highlights";

export function serviceAccountFromEnvironment(env = process.env) {
  const rawServiceAccount = env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) return null;
  try {
    const serviceAccount = JSON.parse(rawServiceAccount);
    if (serviceAccount?.type !== "service_account") throw new Error("tipo inválido");
    return serviceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não contém um JSON de conta de serviço válido.");
  }
}

export function mergeForUpsert(highlight, existing = null) {
  assertHighlight(highlight);
  const { id: _id, ...generated } = highlight;
  if (!existing) return generated;

  delete generated.active;
  delete generated.lastActivatedDate;
  generated.order = Number.isInteger(existing.order) ? existing.order : 0;
  return generated;
}

async function createFirestore(env) {
  const serviceAccount = serviceAccountFromEnvironment(env);
  const projectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || serviceAccount?.project_id;
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT não configurado para a publicação.");
  let credential;
  if (serviceAccount) {
    credential = cert(serviceAccount);
  } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      await access(env.GOOGLE_APPLICATION_CREDENTIALS);
    } catch {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS aponta para um arquivo inexistente ou inacessível.");
    }
    credential = applicationDefault();
  } else {
    credential = applicationDefault();
  }
  const app = getApps()[0] || initializeApp({ credential, projectId });
  return getFirestore(app, env.FIRESTORE_DATABASE_ID || "default");
}

export async function publishHighlights(highlights, { env = process.env, firestore = null } = {}) {
  if (!Array.isArray(highlights) || highlights.length === 0) throw new Error("Nenhum destaque válido para publicar.");
  if (highlights.length > 100) throw new Error("A publicação do Curator aceita no máximo 100 destaques por execução.");
  const ids = new Set();
  for (const highlight of highlights) {
    assertHighlight(highlight);
    if (ids.has(highlight.id)) throw new Error(`ID duplicado na publicação: ${highlight.id}`);
    ids.add(highlight.id);
  }

  const database = firestore || await createFirestore(env);
  const collection = database.collection(COLLECTION);
  const references = highlights.map(({ id }) => collection.doc(id));
  const snapshots = await database.getAll(...references);
  const batch = database.batch();
  let created = 0;
  let updated = 0;
  let preserved = 0;

  snapshots.forEach((snapshot, index) => {
    const existing = snapshot.exists ? snapshot.data() : null;
    if (existing) {
      updated += 1;
      if (Object.hasOwn(existing, "active") || Object.hasOwn(existing, "lastActivatedDate")) preserved += 1;
    } else {
      created += 1;
    }
    batch.set(references[index], mergeForUpsert(highlights[index], existing), { merge: true });
  });
  await batch.commit();
  return { created, updated, preserved, rejected: 0 };
}
