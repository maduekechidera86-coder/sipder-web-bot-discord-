/**
 * Button and select-menu routing for the interactive hubs (/fun and friends).
 *
 * The original interaction router still owns slash commands and the verification
 * button; this dispatcher only sees component ids that start with a prefix a
 * command file registered, so nothing existing changes behaviour.
 */
const handlers = new Map();

/** prefix example: 'web:fun' → every button id starting with it lands in handler. */
export function registerComponent(prefix, handler) {
  if (typeof handler !== 'function') throw new Error(`registerComponent(${prefix}) needs a function.`);
  handlers.set(prefix, handler);
  return () => handlers.delete(prefix);
}

export function componentPrefixes() {
  return [...handlers.keys()];
}

export async function handleComponent(interaction) {
  const id = interaction.customId ?? '';
  for (const [prefix, handler] of handlers) {
    if (id.startsWith(prefix)) return handler(interaction);
  }
  return undefined;
}

export default handleComponent;
