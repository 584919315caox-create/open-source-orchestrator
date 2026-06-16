import { runWorkflow } from "../src/orchestrator.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const result = await runWorkflow(req.body?.workflow);
  res.status(result.ok ? 200 : 400).json(result);
}
