export const validateText = (name: string, text: string): string => {
  if (text.includes("\u0000")) {
    throw new Error(`Invalid ${name}: null character is not allowed`);
  }
  return text;
};

export const normalizeTopic = (topic: string): string => {
  const normalizedTopic = validateText("topic", topic).replace(/\/+$/, "");
  if (normalizedTopic === "") {
    throw new Error(`Invalid topic: "${topic}"`);
  }
  return normalizedTopic;
};
