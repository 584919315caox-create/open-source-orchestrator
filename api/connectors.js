import { getConnectors, getExampleWorkflow } from "../src/orchestrator.js";

export default function handler(req, res) {
  res.status(200).json({
    connectors: getConnectors(),
    exampleWorkflow: getExampleWorkflow()
  });
}
