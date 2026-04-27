function isElementLike(value) {
  return Boolean(value && typeof value === 'object' && value.nodeType === 1);
}

function isHtmlElementLike(value) {
  if (!isElementLike(value)) {
    return false;
  }
  const HTMLElementClass = value.ownerDocument?.defaultView?.HTMLElement;
  return typeof HTMLElementClass === 'function' ? value instanceof HTMLElementClass : true;
}

/**
 * @param {string} text
 * @param {{ documentRef?: Document; navigatorRef?: any }} [options]
 */
export async function copyTextToClipboard(
  text,
  { documentRef = document, navigatorRef = navigator } = {}
) {
  const normalizedText = String(text || '');
  if (!normalizedText) {
    return false;
  }
  try {
    if (navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(normalizedText);
      return true;
    }
  } catch (_error) {
    // Fall through to the document command fallback for older or restricted browsers.
  }

  const fallbackTextArea = documentRef.createElement('textarea');
  fallbackTextArea.value = normalizedText;
  fallbackTextArea.setAttribute('readonly', '');
  fallbackTextArea.style.position = 'fixed';
  fallbackTextArea.style.opacity = '0';
  fallbackTextArea.style.pointerEvents = 'none';
  documentRef.body.appendChild(fallbackTextArea);
  fallbackTextArea.select();
  let copied = false;
  try {
    copied = documentRef.execCommand('copy');
  } catch (_error) {
    copied = false;
  }
  documentRef.body.removeChild(fallbackTextArea);
  return copied;
}

export function getModelTurnMessages(conversation, rootMessageId, getConversationPathMessages) {
  const pathMessages =
    typeof getConversationPathMessages === 'function'
      ? getConversationPathMessages(conversation)
      : [];
  const startIndex = pathMessages.findIndex((candidate) => candidate?.id === rootMessageId);
  if (startIndex < 0) {
    return [];
  }
  const turnMessages = [];
  for (let index = startIndex; index < pathMessages.length; index += 1) {
    const candidate = pathMessages[index];
    if (!candidate) {
      continue;
    }
    if (index > startIndex && candidate.role === 'user') {
      break;
    }
    if (candidate.role === 'model' || candidate.role === 'tool') {
      turnMessages.push(candidate);
    }
  }
  return turnMessages;
}

/**
 * @param {{
 *   documentRef?: Document;
 *   navigatorRef?: any;
 *   getActiveConversation: () => any;
 *   getMessageNodeById: (conversation: any, messageId: string) => any;
 *   getConversationPathMessages: (conversation: any) => any[];
 *   findMessageElement: (messageId: string) => Element | null | undefined;
 *   typesetMathInElement: (element: HTMLElement) => Promise<void>;
 *   extractMathMlFromElement: (element: HTMLElement) => string;
 *   setStatus: (message: string) => void;
 * }} dependencies
 */
export function createMessageCopyController({
  documentRef = document,
  navigatorRef = navigator,
  getActiveConversation,
  getMessageNodeById,
  getConversationPathMessages,
  findMessageElement,
  typesetMathInElement,
  extractMathMlFromElement,
  setStatus,
}) {
  async function buildMathMlCopyText(messageId) {
    const messageElement = findMessageElement(messageId);
    const responseElements = Array.from(
      messageElement?.querySelectorAll('.response-content') || []
    );
    if (!responseElements.length) {
      return '';
    }

    const mathMlBlocks = [];
    for (const responseElement of responseElements) {
      if (!isHtmlElementLike(responseElement)) {
        continue;
      }
      const htmlResponseElement = /** @type {HTMLElement} */ (responseElement);
      await typesetMathInElement(htmlResponseElement);
      const mathMl = extractMathMlFromElement(htmlResponseElement);
      if (mathMl) {
        mathMlBlocks.push(mathMl);
      }
    }
    return mathMlBlocks.join('\n\n');
  }

  async function handleMessageCopyAction(messageId, copyType) {
    const activeConversation = getActiveConversation();
    if (!activeConversation || !messageId) {
      return;
    }
    const message = getMessageNodeById(activeConversation, messageId);
    if (!message) {
      return;
    }

    let textToCopy = '';
    let copiedStatus = 'Copied to clipboard.';
    let emptyStatus = 'Nothing available to copy.';

    if (copyType === 'thoughts') {
      textToCopy = message.role === 'model' ? String(message.thoughts || '') : '';
    } else if (copyType === 'response') {
      if (message.role === 'model') {
        const turnMessages = getModelTurnMessages(
          activeConversation,
          message.id,
          getConversationPathMessages
        );
        textToCopy = turnMessages
          .map((turnMessage) =>
            turnMessage.role === 'tool'
              ? String(turnMessage.toolResult || turnMessage.text || '').trim()
              : String(turnMessage.response || turnMessage.text || '').trim()
          )
          .filter(Boolean)
          .join('\n\n');
      }
    } else if (copyType === 'mathml') {
      if (message.role === 'model') {
        textToCopy = await buildMathMlCopyText(messageId);
      }
      copiedStatus = 'MathML copied to clipboard.';
      emptyStatus = 'No rendered MathML available to copy.';
    } else {
      textToCopy = String(message.text || '');
    }

    if (!textToCopy) {
      setStatus(emptyStatus);
      return;
    }
    const didCopy = await copyTextToClipboard(textToCopy, { documentRef, navigatorRef });
    setStatus(didCopy ? copiedStatus : 'Copy failed.');
  }

  return {
    handleMessageCopyAction,
  };
}
