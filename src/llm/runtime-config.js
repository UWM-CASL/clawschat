function promptContainsMultimodalInputs(prompt) {
  if (!Array.isArray(prompt)) {
    return false;
  }
  return prompt.some((message) => {
    const contentParts = Array.isArray(message?.content) ? message.content : [];
    return contentParts.some(
      (part) => part?.type === 'image' || part?.type === 'audio' || part?.type === 'video'
    );
  });
}

function shouldUseMultimodalGenerationForPrompt(runtime = {}, prompt = null) {
  if (runtime?.multimodalGeneration !== true) {
    return false;
  }
  if (runtime?.preferMultimodalForText === true) {
    return true;
  }
  return promptContainsMultimodalInputs(prompt);
}

export { promptContainsMultimodalInputs, shouldUseMultimodalGenerationForPrompt };
