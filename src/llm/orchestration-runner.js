function getOrchestrationSteps(orchestration) {
  const steps = Array.isArray(orchestration?.steps) ? orchestration.steps : [];
  if (!steps.length) {
    throw new Error('Invalid orchestration definition.');
  }
  steps.forEach((step, index) => {
    if (typeof step?.prompt !== 'string' || !step.prompt.trim()) {
      throw new Error(`Invalid orchestration step at index ${index}.`);
    }
  });
  return steps;
}

export function buildOrchestrationPrompt(step, variables = {}) {
  if (!step || typeof step.prompt !== 'string' || !step.prompt.trim()) {
    throw new Error('Invalid orchestration definition.');
  }
  const renderedPrompt = step.prompt.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) =>
    String(variables[key] ?? ''),
  );
  const responseInstructions =
    typeof step?.responseFormat?.instructions === 'string'
      ? step.responseFormat.instructions.trim()
      : '';
  if (!responseInstructions) {
    return renderedPrompt.trim();
  }
  return `${renderedPrompt.trim()}\n\nResponse format:\n${responseInstructions}`;
}

/**
 * @param {{
 *   generateText: (prompt: string) => Promise<string>;
 *   formatStepOutput?: (step: any, rawOutput: string) => string;
 *   onDebug?: (message: string) => void;
 * }} dependencies
 */
export function createOrchestrationRunner(dependencies) {
  const generateText = dependencies?.generateText;
  const formatStepOutput =
    typeof dependencies?.formatStepOutput === 'function'
      ? dependencies.formatStepOutput
      : (_step, rawOutput) => String(rawOutput || '').trim();
  const onDebug =
    typeof dependencies?.onDebug === 'function' ? dependencies.onDebug : (_message) => {};

  if (typeof generateText !== 'function') {
    throw new Error('Orchestration runner requires a generateText function.');
  }

  return async function runOrchestration(orchestration, variables = {}, options = {}) {
    const orchestrationId =
      typeof orchestration?.id === 'string' ? orchestration.id : 'unnamed-orchestration';
    const runFinalStep = options?.runFinalStep !== false;
    const steps = getOrchestrationSteps(orchestration);
    /** @type {Record<string, string>} */
    const promptVariables = { ...variables };

    onDebug(`Orchestration started: ${orchestrationId} (${steps.length} steps)`);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepName =
        typeof step?.stepName === 'string' && step.stepName.trim()
          ? step.stepName.trim()
          : `Step ${index + 1}`;
      const stepPrompt = buildOrchestrationPrompt(step, promptVariables);
      const isFinalStep = index === steps.length - 1;

      if (isFinalStep && !runFinalStep) {
        onDebug(`Orchestration prepared final step: ${orchestrationId} [${stepName}]`);
        onDebug(`Orchestration completed: ${orchestrationId}`);
        return {
          finalPrompt: stepPrompt,
          finalOutput: '',
        };
      }

      onDebug(`Orchestration step ${index + 1}/${steps.length}: ${orchestrationId} [${stepName}]`);
      const rawStepOutput = await generateText(stepPrompt);
      const stepOutput = formatStepOutput(step, rawStepOutput);
      promptVariables.previousStepOutput = stepOutput;
      promptVariables.lastStepOutput = stepOutput;
      promptVariables[`step${index + 1}Output`] = stepOutput;
      const outputKey = typeof step?.outputKey === 'string' ? step.outputKey.trim() : '';
      if (outputKey) {
        promptVariables[outputKey] = stepOutput;
      }

      if (isFinalStep) {
        onDebug(`Orchestration completed: ${orchestrationId}`);
        return {
          finalPrompt: stepPrompt,
          finalOutput: stepOutput,
        };
      }
    }

    throw new Error('Invalid orchestration definition.');
  };
}
